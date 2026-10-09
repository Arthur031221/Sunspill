# Security

Sunspill is a static page. It has no server, no account and no analytics. The only requests it makes are the three optional OpenStreetMap services (address search, map pictures, building outlines), each off until a person allows it. The page's Content Security Policy names those hosts and no others, and the browser tests check it. See [docs/PRIVACY.md](docs/PRIVACY.md).

If you find a way around that, or any other security problem, please report it privately: use "Report a vulnerability" on the Security tab of this repository. If that is not available to you, open an issue that says you have a security report and leave out the details, and a private way to send them will be arranged.

The latest release gets fixes.
