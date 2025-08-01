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

## PHP Project Analysis (Plan Step 3)

The `analyze_php.js` script scans a PHP project directory and outputs a JSON
summary with detected PHP files, presence of `.htaccess`, files that use MySQL
APIs, and basic entry points. Run it with:

```bash
npm run analyze -- path/to/php/project
```

Example using the provided test data:

```bash
npm run analyze -- test_data/simple
```

## PHP Parsing and Intermediate Representation (Plan Step 4)

The `parse_php.js` script performs a lightweight scan of PHP files to
extract potential routes and SQL queries. It outputs a JSON structure
that can later be used for generating Express code.

Run it similarly to the analysis step:

```bash
npm run parse -- test_data/simple
```
