# Security policy

## Supported versions

Krevaya doesn't have numbered releases yet, so security fixes land on the `main` branch. Keep your server
on the latest `main`; [Upgrading](docs/operations.md#upgrading) shows how.

## Reporting a vulnerability

Please don't open a public issue, discussion or pull request for a security problem.

Report it privately through GitHub instead: open this repository's **Security** tab and choose
**Report a vulnerability**. Only the maintainers can see what you send.

It helps to include:

- what the problem is and what an attacker could do with it
- steps to reproduce it, or a proof of concept
- the commit you tested and how Krevaya was running (Docker compose, a Linux server, or a development setup)
- any settings that matter, such as open sign-up, share links or the assistant API

## What happens next

We'll confirm we've received your report and keep you updated while we look into it. Once a fix is ready,
we'll release it with a security advisory and credit you, unless you'd rather not be named.

## Scope

This policy covers the code in this repository: the server, the editor and the deployment files. If the
problem is in a dependency, please report it to that project as well, and tell us if Krevaya needs a change.
