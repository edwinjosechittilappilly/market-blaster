# Launch directories

Project directories are generally one-time listings, not posts for every campaign. Check each directory's current eligibility and submission rules, and submit manually. A listing or editorial approval is not guaranteed.

```bash
mblast launch
mblast launch --mark devhunt --url https://devhunt.org/tool/example
mblast launch
```

The checklist covers DevHunt, AlternativeTo, Uneed, Indie Hackers and Product Hunt. It prints submission links, notes and recorded listing URLs. Indie Hackers' product page availability and submission URL are unverified; sign in and check. DevHunt is for developer tools; its chosen launch week is paid. Uneed's free submission has queue and public visibility conditions. AlternativeTo requires released software and a verified email.

Use `--mark` only after obtaining the listing URL. Accepted directory IDs are `devhunt`, `alternativeto`, `uneed`, `indie-hackers`, and `product-hunt`; the URL must be HTTPS. Marking records the URL locally; it does not submit or verify a listing. State is stored in `_launch.json` under the configured `campaignsDir`.
