# THADEAS static site

This folder is a static HTML/CSS website for THADEAS.

## Files

- `content/site.json` contains editable site content.
- `scripts/build-site.mjs` validates the content and generates the public HTML.
- `index.html` is the generated public page.
- `styles.css` contains the responsive layout and visual styling.
- `assets/` contains optimized image and logo assets used by the page.
- `public/design-*` contains older static design explorations.

## Content Updates

Edit `content/site.json`, not `index.html`.

The build rules are intentionally strict:

- `About` is editable through `about.paragraphs`.
- `Tour Dates` renders only when `events` contains visible, complete events.
- `Tickets` renders only when at least one visible event has a real ticket URL.
- Press Pack renders only when `pressPack.dropboxUrl` contains a real Dropbox URL.
- Ticket links are per event. Use `Smsticket` as the label when the event uses Smsticket, or the club ticketing name when it does not.
- Do not add filler values such as `TBA`; the generator blocks known placeholder/fallback content from the public page.

Each visible event needs:

- `date`: ISO date in `YYYY-MM-DD` format.
- `place`: venue and city.
- `name`: event name.
- `note`: optional public note.
- `infoUrl`: optional non-ticket event or venue information link.
- `ticketLinks`: optional array of real ticket links.

The repository is public, so do not put sensitive unpublished information in `content/site.json`.

## Run locally

Generate the public HTML:

```bash
node scripts/build-site.mjs
```

Then open `index.html` directly in a browser, or serve the folder with any static server:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Deploy

Deploy the folder as static files. No Next.js, package install, or runtime server is required.

This repository includes a GitHub Pages workflow at `.github/workflows/pages.yml`.
Pushes to `main` generate the static HTML from `content/site.json` and deploy it to GitHub Pages.
