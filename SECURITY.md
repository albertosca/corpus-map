# Security policy

## Reporting a vulnerability

Please report a vulnerability privately, through GitHub's private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. Please do not open a public issue for it.

You can expect an acknowledgement within a week. This is a small project maintained by one person, so there is no fixed fix deadline, but a confirmed vulnerability is handled before feature work.

## Scope

`corpus-map` is a browser library that draws data its consumer hands it. It makes no network request of its own, stores nothing, and executes no data it is given. The reports that matter most are the ones where crafted input (a spec, a name, an attribute) makes the library run script, read or send something it should not, or hang the page.

Only the latest published release is supported.
