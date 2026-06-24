# THADEAS static site

This folder is a static HTML/CSS website for THADEAS.

## Files

- `index.html` contains the page content and structure.
- `styles.css` contains the responsive layout and visual styling.
- `assets/` contains optimized image and logo assets used by the page.
- `public/design-*` contains older static design explorations.

## Content Updates

- Edit the artist bio in the `#about` section of `index.html`.
- Add confirmed events by duplicating the event card in the `#tour-dates` section.
- Add event-specific Smsticket or club ticketing URLs in `#tour-dates` and `#tickets`.
- Replace the press pack mail link with a Dropbox shared URL when the final press pack link is available.
- Keep Instagram and SoundCloud as the primary social links; Facebook is included as an event-focused secondary link.

## Run locally

Open `index.html` directly in a browser, or serve the folder with any static server:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Deploy

Deploy the folder as static files. No Node.js, Next.js, build command, or package install is required.

This repository includes a GitHub Pages workflow at `.github/workflows/pages.yml`.
Pushes to `main` deploy the current static files to GitHub Pages.
