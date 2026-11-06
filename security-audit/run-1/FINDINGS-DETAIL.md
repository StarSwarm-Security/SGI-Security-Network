# Findings detail

Confirmed records at medium or above. Reproduction stays on a local file page. Do not send the payload to a deployed host.

## Cisco Analyze assigns unescaped parser captures to innerHTML

Fingerprint: `client.analyze.unescaped-finding-html`. Overall severity: medium. Confidence: high.

### Trace

1. **Entrypoint.** `app.js` line 171, `run-analyze` click. The handler reads `textarea#paste` and passes it to `runSwarm`.
2. **Propagation.** `js/analyzers.js` line 1321, `analyzeSecurity`. A `username <token> password <token>` line stores the raw username token in the finding title. The same class of bug copies a DHCP pool name (`js/analyzers.js` lines 289 and 1216), a BPDU iface token (line 808), and an err-disabled Ethernet token (line 868).
3. **Propagation.** `js/analyzers.js` line 1574, `coordinate`. `summary.headline` is that title, so the capture is repeated in the lede.
4. **Propagation.** `app.js` line 178. The Cisco renderer interpolates the headline and each title with no call to `esc()`.
5. **Sink.** `app.js` line 187. `#analyze-out.innerHTML` parses the string. The svg `onload` handler runs.

`paintScan` at `app.js` line 228 encodes the other Analyze modes. Show-interface names (`js/analyzers.js` line 330) use a character class that rejects `<`, so that particular capture does not carry a tag.

### Principal and resource

Dummy attacker: the author of a config or log line. Dummy victim: the operator who pastes it and clicks Run offline after the gate has stored a session. Affected resource: the origin's `localStorage` key `sgi.session.v1` and the `sgi_session` cookie written by `js/auth-client.js` lines 125 and 138. The local check did not read a real token. It set `documentElement.dataset.xss`.

### Local reproduction

Payload:

```text
username <svg/onload=document.documentElement.dataset.xss=1> password hunter
```

1. Import `runSwarm` from `js/analyzers.js` and call it with that text and `deviceType: "auto"`.
2. Build the HTML string the click handler builds: findings count, `summary.headline`, then each finding title, specialist, and fix. Do not call `esc()`.
3. Assign that string to an element's `innerHTML` in a local `file://` page. Open it in headless Chrome with no network.
4. After the nodes remain in the document, read `document.documentElement.dataset.xss`.

Observed: the headline and the title both contained the svg. Chrome created two svg elements. `data-xss` was `1`. The same HTML passed through `esc()` created no svg. No deployed host was contacted.

The invariant this proves: untrusted paste text is parsed as HTML in the signed-in origin.

### Conditions and containment

- The operator must paste and click. That is how Cisco Analyze is used.
- The shell starts `inert` (`index.html` line 80) and `bootSgi` (`app.js` line 538) removes that only after an accepted session.
- The paste must hit a capture that copies an unrestricted token into a title.
- The repository document and the edge `SEC` headers define no Content-Security-Policy. A policy added only on the live host was not observed and could still block the handler there.

The bug is confined to the Cisco render path. It does not by itself call the API.

### Remediation

Encode `summary.headline`, severity, title, specialist, detail, and fix with the existing `esc()` before concatenation, or build the nodes with `textContent`. Keep parser captures as data. A regression should render the payload above and assert that `analyze-out` contains no `svg` element and that the visible text still shows the username token.
