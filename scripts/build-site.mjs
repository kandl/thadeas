import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_PATH = path.join(ROOT_DIR, 'content', 'site.json');
const REQUIRED_SOUNDCLOUD_TEXT =
  'Hear current THADEAS mixes including live sets from Dance Radio, Musart guest mixes and other exclusive recordings.';

const FORBIDDEN_PUBLIC_PATTERNS = [
  { label: 'TBA', pattern: /\bTBA\b/i },
  { label: 'GoOut', pattern: /GoOut/i },
  { label: 'placeholder', pattern: /placeholder/i },
  { label: 'rezidentura', pattern: /rezidentura/i },
  { label: 'residency popup', pattern: /residency\s+popup/i }
];

const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC'
});

function fail(message) {
  throw new Error(`[content/site.json] ${message}`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function requiredObject(source, key, pathName) {
  const value = source[key];

  if (!isPlainObject(value)) {
    fail(`${pathName}.${key} must be an object.`);
  }

  return value;
}

function requiredString(source, key, pathName) {
  const value = cleanString(source[key]);

  if (!value) {
    fail(`${pathName}.${key} must be a non-empty string.`);
  }

  return value;
}

function optionalString(source, key, pathName) {
  const value = source[key];

  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value !== 'string') {
    fail(`${pathName}.${key} must be a string when provided.`);
  }

  return value.trim();
}

function requiredStringArray(source, key, pathName) {
  const value = source[key];

  if (!Array.isArray(value) || value.length === 0) {
    fail(`${pathName}.${key} must be a non-empty array of strings.`);
  }

  return value.map((item, index) => {
    const cleaned = cleanString(item);

    if (!cleaned) {
      fail(`${pathName}.${key}[${index}] must be a non-empty string.`);
    }

    return cleaned;
  });
}

function requiredWebUrl(source, key, pathName) {
  const value = requiredString(source, key, pathName);

  return validateWebUrl(value, `${pathName}.${key}`);
}

function optionalWebUrl(source, key, pathName) {
  const value = optionalString(source, key, pathName);

  return value ? validateWebUrl(value, `${pathName}.${key}`) : '';
}

function validateWebUrl(value, pathName) {
  try {
    const url = new URL(value);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      fail(`${pathName} must use http:// or https://.`);
    }

    return value;
  } catch {
    fail(`${pathName} must be a valid absolute URL.`);
  }
}

function validateEmail(value, pathName) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    fail(`${pathName} must be a valid email address.`);
  }

  return value;
}

function validateIsoDate(value, pathName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${pathName} must use YYYY-MM-DD format.`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!isValid) {
    fail(`${pathName} must be a real calendar date.`);
  }

  return value;
}

function parseOutputDir(args) {
  if (args.length === 0) {
    return ROOT_DIR;
  }

  if (args.length !== 2 || args[0] !== '--out-dir') {
    throw new Error('Usage: node scripts/build-site.mjs [--out-dir relative/path]');
  }

  const outputDir = path.resolve(ROOT_DIR, args[1]);
  const relativeOutputDir = path.relative(ROOT_DIR, outputDir);

  if (!relativeOutputDir || relativeOutputDir.startsWith('..') || path.isAbsolute(relativeOutputDir)) {
    throw new Error('--out-dir must be a relative path inside the repository.');
  }

  return outputDir;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function normalizeContent(source) {
  if (!isPlainObject(source)) {
    fail('Root value must be an object.');
  }

  const meta = requiredObject(source, 'meta', 'root');
  const artist = requiredObject(source, 'artist', 'root');
  const about = requiredObject(source, 'about', 'root');
  const music = requiredObject(source, 'music', 'root');
  const socials = requiredObject(source, 'socials', 'root');
  const pressPack = requiredObject(source, 'pressPack', 'root');
  const soundCloudText = requiredString(music, 'soundCloudText', 'music');

  if (soundCloudText !== REQUIRED_SOUNDCLOUD_TEXT) {
    fail(`music.soundCloudText must be exactly: "${REQUIRED_SOUNDCLOUD_TEXT}"`);
  }

  const events = normalizeEvents(source.events);

  return {
    meta: {
      title: requiredString(meta, 'title', 'meta'),
      description: requiredString(meta, 'description', 'meta'),
      ogDescription: requiredString(meta, 'ogDescription', 'meta')
    },
    artist: {
      name: requiredString(artist, 'name', 'artist'),
      base: requiredString(artist, 'base', 'artist'),
      role: requiredString(artist, 'role', 'artist'),
      summary: requiredString(artist, 'summary', 'artist'),
      bookingEmail: validateEmail(requiredString(artist, 'bookingEmail', 'artist'), 'artist.bookingEmail')
    },
    about: {
      heading: requiredString(about, 'heading', 'about'),
      paragraphs: requiredStringArray(about, 'paragraphs', 'about')
    },
    music: {
      soundCloudUrl: requiredWebUrl(music, 'soundCloudUrl', 'music'),
      soundCloudText
    },
    socials: {
      instagram: requiredWebUrl(socials, 'instagram', 'socials'),
      soundcloud: requiredWebUrl(socials, 'soundcloud', 'socials'),
      facebook: requiredWebUrl(socials, 'facebook', 'socials')
    },
    pressPack: {
      dropboxUrl: optionalWebUrl(pressPack, 'dropboxUrl', 'pressPack'),
      placement: normalizePressPackPlacement(pressPack)
    },
    events
  };
}

function normalizePressPackPlacement(pressPack) {
  const placement = optionalString(pressPack, 'placement', 'pressPack') || 'footer';

  if (placement !== 'header' && placement !== 'footer') {
    fail('pressPack.placement must be "header" or "footer".');
  }

  return placement;
}

function normalizeEvents(events) {
  if (events === undefined) {
    return [];
  }

  if (!Array.isArray(events)) {
    fail('events must be an array.');
  }

  return events
    .map((event, index) => normalizeEvent(event, index))
    .filter(Boolean)
    .sort((first, second) => first.date.localeCompare(second.date) || first.sourceIndex - second.sourceIndex);
}

function normalizeEvent(event, index) {
  const pathName = `events[${index}]`;

  if (!isPlainObject(event)) {
    fail(`${pathName} must be an object.`);
  }

  if (event.visible === false) {
    return null;
  }

  if (event.visible !== undefined && typeof event.visible !== 'boolean') {
    fail(`${pathName}.visible must be a boolean when provided.`);
  }

  return {
    sourceIndex: index,
    date: validateIsoDate(requiredString(event, 'date', pathName), `${pathName}.date`),
    displayDate: optionalString(event, 'displayDate', pathName),
    place: requiredString(event, 'place', pathName),
    name: requiredString(event, 'name', pathName),
    note: optionalString(event, 'note', pathName),
    ticketLinks: normalizeTicketLinks(event.ticketLinks, `${pathName}.ticketLinks`)
  };
}

function normalizeTicketLinks(ticketLinks, pathName) {
  if (ticketLinks === undefined) {
    return [];
  }

  if (!Array.isArray(ticketLinks)) {
    fail(`${pathName} must be an array when provided.`);
  }

  return ticketLinks.map((ticketLink, index) => {
    const ticketPath = `${pathName}[${index}]`;

    if (!isPlainObject(ticketLink)) {
      fail(`${ticketPath} must be an object.`);
    }

    return {
      label: requiredString(ticketLink, 'label', ticketPath),
      url: requiredWebUrl(ticketLink, 'url', ticketPath)
    };
  });
}

function formatEventDate(event) {
  if (event.displayDate) {
    return event.displayDate;
  }

  const [year, month, day] = event.date.split('-').map(Number);
  return DATE_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)));
}

function renderNav(events, ticketedEvents) {
  const items = [
    { href: '#about', label: 'About' },
    events.length > 0 ? { href: '#tour-dates', label: 'Tour Dates' } : null,
    ticketedEvents.length > 0 ? { href: '#tickets', label: 'Tickets' } : null,
    { href: '#music', label: 'Music' },
    { href: '#booking', label: 'Contact' }
  ].filter(Boolean);

  return items.map((item) => `<a href="${escapeAttr(item.href)}">${escapeHtml(item.label)}</a>`).join('\n              ');
}

function renderHeaderActions(site) {
  const pressPackButton =
    site.pressPack.dropboxUrl && site.pressPack.placement === 'header'
      ? `
              <a
                class="button button--outline button--compact"
                href="${escapeAttr(site.pressPack.dropboxUrl)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                Press Pack
              </a>`
      : '';

  return `<div class="header-actions">
              <nav class="social-links social-links--header" aria-label="Primary social links">
                <a
                  href="${escapeAttr(site.socials.instagram)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  IG
                </a>
                <a
                  href="${escapeAttr(site.socials.soundcloud)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  SC
                </a>
              </nav>${pressPackButton}
              <a class="button button--outline button--compact" href="mailto:${escapeAttr(site.artist.bookingEmail)}">
                Contact
              </a>
            </div>`;
}

function renderAboutSection(site) {
  const [leadParagraph, ...supportingParagraphs] = site.about.paragraphs;
  const supportingHtml = supportingParagraphs
    .map(
      (paragraph) => `
            <p class="section-copy section-copy--dark">
              ${escapeHtml(paragraph)}
            </p>`
    )
    .join('');

  return `<section class="section section--light" id="about" aria-labelledby="about-title">
        <div class="split split--profile page-shell">
          <div>
            <p class="eyebrow eyebrow--dark">About</p>
            <h2 class="section-title" id="about-title">${escapeHtml(site.about.heading)}</h2>
          </div>

          <div class="profile-copy">
            <p class="lead">
              ${escapeHtml(leadParagraph)}
            </p>${supportingHtml}

            <div class="press-grid" aria-label="Press photos">
              <img
                src="assets/thadeas-press-1.jpg"
                width="1600"
                height="1068"
                alt="THADEAS press photo one"
                loading="lazy"
                decoding="async"
              >
              <img
                src="assets/thadeas-press-2.jpg"
                width="1600"
                height="1068"
                alt="THADEAS press photo two"
                loading="lazy"
                decoding="async"
              >
              <img
                src="assets/thadeas-square.jpg"
                width="1200"
                height="1200"
                alt="THADEAS square press photo"
                loading="lazy"
                decoding="async"
              >
            </div>
          </div>
        </div>
      </section>`;
}

function renderTourDatesSection(events) {
  if (events.length === 0) {
    return '';
  }

  const eventCards = events.map(renderEventCard).join('\n');

  return `<section class="section section--light" id="tour-dates" aria-labelledby="tour-dates-title">
        <div class="page-shell">
          <div class="section-header">
            <p class="eyebrow eyebrow--dark">Tour Dates</p>
            <h2 class="section-title" id="tour-dates-title">Upcoming dates.</h2>
          </div>

          <div class="event-list">
${eventCards}
          </div>
        </div>
      </section>`;
}

function renderEventCard(event) {
  const ticketActions =
    event.ticketLinks.length > 0
      ? `
            <div class="event-card__actions">
${event.ticketLinks.map((ticketLink) => renderTicketButton(ticketLink, 'button--ink')).join('\n')}
            </div>`
      : '';
  const note = event.note
    ? `
              <p class="event-card__note">${escapeHtml(event.note)}</p>`
    : '';

  return `            <article class="event-card">
              <p class="event-card__date">
                <time datetime="${escapeAttr(event.date)}">${escapeHtml(formatEventDate(event))}</time>
              </p>
              <div class="event-card__main">
                <h3 class="event-card__title">${escapeHtml(event.name)}</h3>
                <p class="event-card__meta">${escapeHtml(event.place)}</p>${note}
              </div>${ticketActions}
            </article>`;
}

function renderTicketsSection(ticketedEvents) {
  if (ticketedEvents.length === 0) {
    return '';
  }

  const ticketCards = ticketedEvents.map(renderTicketCard).join('\n');

  return `<section class="section section--dark" id="tickets" aria-labelledby="tickets-title">
        <div class="page-shell">
          <div class="section-header">
            <p class="eyebrow">Tickets</p>
            <h2 class="section-title" id="tickets-title">Current presales.</h2>
            <p class="section-copy">
              Official ticket links for announced THADEAS events.
            </p>
          </div>

          <div class="ticket-grid">
${ticketCards}
          </div>
        </div>
      </section>`;
}

function renderTicketCard(event) {
  return `            <article class="ticket-card">
              <p class="ticket-card__meta">${escapeHtml(formatEventDate(event))} / ${escapeHtml(event.place)}</p>
              <h3 class="ticket-card__title">${escapeHtml(event.name)}</h3>
              <div class="ticket-card__actions">
${event.ticketLinks.map((ticketLink) => renderTicketButton(ticketLink, 'button--outline')).join('\n')}
              </div>
            </article>`;
}

function renderTicketButton(ticketLink, variant) {
  return `              <a
                class="button ${variant}"
                href="${escapeAttr(ticketLink.url)}"
                target="_blank"
                rel="noopener noreferrer"
              >
                ${escapeHtml(ticketLink.label)}
              </a>`;
}

function renderBookingLinks(site) {
  const links = [
    { eyebrow: 'Priority', label: 'Instagram', url: site.socials.instagram },
    { eyebrow: 'Priority', label: 'SoundCloud', url: site.socials.soundcloud },
    { eyebrow: 'Events', label: 'Facebook', url: site.socials.facebook },
    site.pressPack.dropboxUrl && site.pressPack.placement === 'footer'
      ? { eyebrow: 'Download', label: 'Press Pack', url: site.pressPack.dropboxUrl }
      : null
  ].filter(Boolean);

  return links
    .map(
      (link) => `            <a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer">
              <span>${escapeHtml(link.eyebrow)}</span>
              <strong>${escapeHtml(link.label)}</strong>
            </a>`
    )
    .join('\n');
}

function renderPage(site) {
  const ticketedEvents = site.events.filter((event) => event.ticketLinks.length > 0);
  const encodedSoundCloudUrl = encodeURIComponent(site.music.soundCloudUrl);
  const optionalSections = [renderTourDatesSection(site.events), renderTicketsSection(ticketedEvents)]
    .filter(Boolean)
    .join('\n\n      ');
  const optionalSectionsHtml = optionalSections ? `\n\n      ${optionalSections}\n` : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(site.meta.title)}</title>
    <meta
      name="description"
      content="${escapeAttr(site.meta.description)}"
    >
    <meta property="og:title" content="${escapeAttr(site.meta.title)}">
    <meta
      property="og:description"
      content="${escapeAttr(site.meta.ogDescription)}"
    >
    <meta property="og:type" content="website">
    <meta property="og:image" content="assets/thadeas-hero.jpg">
    <link rel="icon" href="favicon.ico" sizes="any">
    <link rel="stylesheet" href="styles.css">
  </head>
  <body>
    <main>
      <section class="hero" id="top">
        <div class="hero__media" aria-hidden="true">
          <img
            src="assets/thadeas-hero.jpg"
            width="2400"
            height="1602"
            alt=""
            fetchpriority="high"
            decoding="async"
          >
        </div>

        <div class="hero__shell page-shell">
          <header class="site-header">
            <a class="site-logo" href="#top" aria-label="${escapeAttr(site.artist.name)} home">
              <img src="assets/thadeas-single-line.svg" width="993" height="267" alt="${escapeAttr(site.artist.name)}">
            </a>

            <nav class="site-nav" aria-label="Main navigation">
              ${renderNav(site.events, ticketedEvents)}
            </nav>

            ${renderHeaderActions(site)}
          </header>

          <div class="hero__content hero__content--solo">
            <section class="hero__copy" aria-labelledby="hero-title">
              <p class="eyebrow">${escapeHtml(site.artist.base)}</p>
              <h1 class="hero__title" id="hero-title">${escapeHtml(site.artist.name)}</h1>
              <p class="hero__summary">
                ${escapeHtml(site.artist.summary)}
              </p>
              <div class="button-row" aria-label="Primary actions">
                <a class="button button--primary" href="mailto:${escapeAttr(site.artist.bookingEmail)}">
                  Book ${escapeHtml(site.artist.name)}
                </a>
                <a
                  class="button button--outline"
                  href="${escapeAttr(site.socials.instagram)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Instagram
                </a>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section class="facts" aria-label="Artist facts">
        <div class="facts__grid page-shell">
          <article class="fact">
            <h2 class="fact__label">Base</h2>
            <p class="fact__value">${escapeHtml(site.artist.base)}</p>
          </article>
          <article class="fact">
            <h2 class="fact__label">Role</h2>
            <p class="fact__value">${escapeHtml(site.artist.role)}</p>
          </article>
          <article class="fact">
            <h2 class="fact__label">Social</h2>
            <p class="fact__value">
              <a href="${escapeAttr(site.socials.instagram)}" target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
              /
              <a href="${escapeAttr(site.socials.soundcloud)}" target="_blank" rel="noopener noreferrer">
                SoundCloud
              </a>
            </p>
          </article>
          <article class="fact">
            <h2 class="fact__label">Booking</h2>
            <p class="fact__value">
              <a href="mailto:${escapeAttr(site.artist.bookingEmail)}">${escapeHtml(site.artist.bookingEmail)}</a>
            </p>
          </article>
        </div>
      </section>

      ${renderAboutSection(site)}
${optionalSectionsHtml}

      <section class="section section--dark" id="music" aria-labelledby="music-title">
        <div class="split split--music page-shell">
          <div class="section__intro">
            <p class="eyebrow">SoundCloud</p>
            <h2 class="section-title" id="music-title">Mixes, radio sets and exclusives.</h2>
            <p class="section-copy">
              ${escapeHtml(site.music.soundCloudText)}
            </p>
            <a
              class="button button--outline"
              href="${escapeAttr(site.music.soundCloudUrl)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              SoundCloud
            </a>
          </div>

          <iframe
            class="soundcloud-player"
            title="${escapeAttr(site.artist.name)} SoundCloud profile"
            src="https://w.soundcloud.com/player/?url=${encodedSoundCloudUrl}&amp;color=%236ee7ff&amp;auto_play=false&amp;hide_related=true&amp;show_comments=false&amp;show_user=true&amp;show_reposts=false&amp;show_teaser=false&amp;visual=true"
            loading="lazy"
            allow="autoplay"
          ></iframe>
        </div>
      </section>

      <section class="section section--dark" id="booking" aria-labelledby="booking-title">
        <div class="page-shell">
          <div class="booking-header">
            <div>
              <p class="eyebrow">Booking</p>
              <h2 class="booking-title" id="booking-title">
                Booking for clubs, bars and private events.
              </h2>
            </div>
            <a class="button button--light" href="mailto:${escapeAttr(site.artist.bookingEmail)}">
              ${escapeHtml(site.artist.bookingEmail)}
            </a>
          </div>

          <nav class="booking-links" aria-label="External links">
${renderBookingLinks(site)}
          </nav>
        </div>
      </section>
    </main>
  </body>
</html>
`;
}

function assertNoPublicFiller(html) {
  const failures = FORBIDDEN_PUBLIC_PATTERNS
    .filter((entry) => entry.pattern.test(html))
    .map((entry) => entry.label);

  if (failures.length > 0) {
    fail(`Generated HTML contains forbidden public filler/content: ${failures.join(', ')}.`);
  }
}

async function readContent() {
  const rawContent = await readFile(CONTENT_PATH, 'utf8');

  try {
    return JSON.parse(rawContent);
  } catch (error) {
    fail(`Invalid JSON: ${error.message}`);
  }
}

async function copyStaticFiles(outputDir) {
  await cp(path.join(ROOT_DIR, 'assets'), path.join(outputDir, 'assets'), { recursive: true });
  await copyFile(path.join(ROOT_DIR, 'styles.css'), path.join(outputDir, 'styles.css'));
  await copyFile(path.join(ROOT_DIR, 'favicon.ico'), path.join(outputDir, 'favicon.ico'));
}

async function build() {
  const outputDir = parseOutputDir(process.argv.slice(2));
  const content = normalizeContent(await readContent());
  const html = renderPage(content);

  assertNoPublicFiller(html);

  if (outputDir !== ROOT_DIR) {
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });
    await copyStaticFiles(outputDir);
  }

  await writeFile(path.join(outputDir, 'index.html'), html, 'utf8');
  console.log(`Built ${path.relative(ROOT_DIR, path.join(outputDir, 'index.html')) || 'index.html'}`);
}

await build();
