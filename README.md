# KMZ to CSV Converter

A simple web tool that converts KMZ and KML files to CSV format. Extract point coordinates, lines, and polygon vertices from Google Earth files.

## Features

- Drag and drop file upload
- Supports both .kmz and .kml files
- Extracts Points, Lines, and Polygons
- Client-side processing (no data uploaded to servers)
- Outputs CSV with coordinates, names, and descriptions

## Development

```bash
# Install wrangler if needed
npm install -g wrangler

# Run locally
npx wrangler dev

# Deploy to Cloudflare Workers
npx wrangler deploy
```

## Project Structure

```
├── public/
│   ├── index.html
│   ├── script.js
│   └── styles.css
└── wrangler.toml
```
