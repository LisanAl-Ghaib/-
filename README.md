# Auto Conversion MVP

This project aims to build a minimal viable product that automatically converts legacy PHP projects to Node.js with Express. The MVP demonstrates that conversion can be largely automated while preserving most of the original site functionality.

## Repository Structure

- `src/` – source code for the converter tool
- `test_data/` – sample PHP projects used for testing
- `PLAN.md` – step-by-step development plan

## Upload Service (Plan Step 2)

A simple Express server provides two endpoints:

- `POST /upload` — accepts a zip archive under the field name `archive` and stores it in a temporary directory.
- `POST /clone` — accepts JSON `{ "repoUrl": "<git-url>" }` and clones the repository into a temporary folder.

To start the service:

```bash
npm install
npm start
```

See `PLAN.md` for the complete roadmap.
