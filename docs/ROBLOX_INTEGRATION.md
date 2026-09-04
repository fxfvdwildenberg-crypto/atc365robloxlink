# ATC365 — Roblox integration

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/public/roblox/check?userId=<robloxUserId>` | Server-to-server authorization check. Returns `{"authorized":true}` or `{"authorized":false,"reason":"..."}`. |
| `GET /api/public/roblox/join` | Browser-only. Authenticates the ATC365 Discord session, checks the linked + verified Roblox account and the required Discord role, then performs a server-side 302 to the configured PTFS private-server URL. Returns 403 JSON when unauthorized. |

The routes live under `/api/public/*` because published Lovable sites put every other path
behind the site auth gate — a Roblox game server could not reach `/api/roblox/check`.
Security is enforced inside the handlers (optional shared key + rate limiting + validation).

`reason` values: `invalid_user_id`, `not_linked`, `not_verified`, `missing_role`,
`rate_limited`, `unauthorized_request`.

No Discord IDs, usernames, tokens, or the PTFS URL are ever returned by these endpoints.

## Rate limiting

- `check`: 120 requests / minute per calling IP.
- `join`: 30 / minute per signed-in member.
- Verification start: 10 / 10 minutes per member. Verification confirm: 15 / 10 minutes.

## Roblox server script (ServerScriptService — NEVER a LocalScript)

```lua
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")

local API_URL = "https://atc365robloxlink.lovable.app/api/public/roblox/check"
local API_KEY = "" -- set this only if you configured ROBLOX_API_KEY on the website

local function isAuthorized(userId)
    local url = API_URL .. "?userId=" .. tostring(userId)
    local ok, response = pcall(function()
        return HttpService:RequestAsync({
            Url = url,
            Method = "GET",
            Headers = (API_KEY ~= "" and { ["x-api-key"] = API_KEY }) or {},
        })
    end)

    if not ok or not response.Success then
        return false, "api_unavailable"
    end

    local decoded = HttpService:JSONDecode(response.Body)
    return decoded.authorized == true, decoded.reason
end

Players.PlayerAdded:Connect(function(player)
    local authorized, reason = isAuthorized(player.UserId)
    if not authorized then
        player:Kick("ATC365: not authorized (" .. tostring(reason) .. "). Link and verify your Roblox account at atc365robloxlink.lovable.app")
    end
end)
```

Enable **Game Settings → Security → Allow HTTP Requests**. Authorization is decided on the
Roblox server, never on the client.

## Account verification (proof of ownership)

1. The member signs in with Discord on the website.
2. They enter their Roblox username or User ID; the site issues a single-use code
   (`ATC365-XXXXXXXX`) that expires after 15 minutes.
3. They paste the code into their Roblox profile **About / description** and save it.
4. The site reads the public Roblox profile (`https://users.roblox.com/v1/users/<id>`)
   and links the account only when the code is present.
5. The code is consumed immediately; a Roblox account can only ever be linked to one
   Discord account (unique constraint on `roblox_user_id`).

## Limitations

A website cannot grant entry to a Roblox private server it does not own. The PTFS private
server's own Roblox permissions still apply — ATC365 only decides whether a member is
authorized and then redirects them to the link.
