# @profullstack/saasrow

The [saasrow.com](https://www.saasrow.com) software directory from your
terminal. Search the directory without an account; create and manage your own
free listings and API keys with one.

```bash
npm install -g @profullstack/saasrow
# or run it without installing
npx @profullstack/saasrow --help
```

Node 20.11 or newer. No dependencies.

## Sign in

```bash
saasrow login
```

You are asked for an email address, a one-time code is mailed to it, and you
type the code back. There is no password: proving you can read the inbox is
the account, the same way the website's management links work. The command
creates an API key named after your machine and stores it in
`~/.profullstack/saasrow/config.json` (mode 0600).

For scripts and agents, skip the file and set `SAASROW_API_KEY` instead. It
wins over the stored key.

```bash
saasrow whoami
saasrow logout            # forget the local key
saasrow logout --revoke   # and revoke it on the server
```

## Listings

```bash
saasrow listings create \
  --name "Acme Analytics" \
  --website https://acme.example \
  --description "Privacy-first product analytics you can self-host." \
  --category Analytics \
  --tags analytics,privacy,self-hosted \
  --use-cases analytics \
  --audiences developers \
  --platforms web \
  --pricing-model freemium \
  --alternatives "Google Analytics,Mixpanel"

saasrow listings list
saasrow listings get <id>
saasrow listings update <id> --description "…"
saasrow listings delete <id>
```

A new listing is reviewed before it appears in the directory, exactly like a
submission from the website. `--from listing.json` reads the same fields from
a file (`--from -` reads stdin); flags override individual fields on top of
it. Run `saasrow vocabulary` for the accepted use case, audience, platform and
pricing terms; anything outside the vocabulary is dropped rather than
rejected.

## API keys

```bash
saasrow keys list
saasrow keys create "CI deploy"       # prints the key once
saasrow keys rename sr_abcd1234 "Laptop"
saasrow keys revoke sr_abcd1234
```

Keys can be addressed by full id or by the `sr_…` prefix shown in the list.
The same keys work for the REST API (`Authorization: Bearer …`) and the MCP
server:

```bash
claude mcp add --transport http saasrow https://www.saasrow.com/api/mcp \
  --header "Authorization: Bearer sr_…"
```

## Directory

```bash
saasrow search "analytics" --pricing-model free --limit 10
saasrow search --alternative-to Notion
saasrow categories
saasrow vocabulary
```

## Output

Every command accepts `--json` and then prints the raw API response, so the
output is safe to pipe into `jq` or hand to an agent. Human-readable output
goes to stdout; progress and hints go to stderr.

Exit codes: `0` success, `1` the server said no, `2` usage error.

## Configuration

| What | Where |
| --- | --- |
| Stored key | `~/.profullstack/saasrow/config.json` |
| Override the file | `SAASROW_CONFIG=/path/to/file.json` |
| Override the directory | `SAASROW_HOME=/dir` or `PROFULLSTACK_HOME=/dir` |
| Key from the environment | `SAASROW_API_KEY=sr_…` |
| Different server | `--api-url https://…` or `SAASROW_API_URL` |

The API itself is documented at <https://www.saasrow.com/api/v1>.
