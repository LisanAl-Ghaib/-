# Auto Conversion MVP

This project aims to build a minimal viable product that automatically converts legacy PHP projects to Node.js with Express. The MVP demonstrates that conversion can be largely automated while preserving most of the original site functionality.

## Quick Start

```bash
npm install
npm start
npm run demo # optional demo using test data
```

The server listens on port 3000. Upload a project with `POST /upload` or trigger conversion with `POST /convert`.

## Docker Usage

Run the service in an isolated container if you don't want to install Node.js locally:

```bash
docker build -t php2express .
docker run -p 8080:8080 php2express
```

The service will be available at `http://localhost:8080`.

The included `docker-compose.yml` allows the same with a single command:

```bash
docker compose up
```

## Repository Structure

- `app/` – command-line tools and server used by the user
- `tools/` – internal utilities
- `test_data/` – sample PHP projects used for testing
- `PLAN.md` – step-by-step development plan

## Upload Service (Plan Step 2)

A simple Express server provides two endpoints:

- `POST /upload` — accepts a zip archive under the field name `archive` and stores it in a temporary directory.
- `POST /clone` — accepts JSON `{ "repoUrl": "<git-url>" }` and clones the repository into a temporary folder.

See `PLAN.md` for the complete roadmap.

## API Usage Examples (Plan Step 4)

The upload service exposes three main endpoints. The snippets below show how to
use them with `curl`:

```bash
# 1) Upload a zip archive
curl -F "archive=@project.zip" http://localhost:3000/upload

# 2) Clone a git repository
curl -X POST http://localhost:3000/clone \
  -H 'Content-Type: application/json' \
  -d '{"repoUrl":"https://example.com/repo.git"}'

# 3) Run the full conversion
curl -X POST http://localhost:3000/convert \
  -H 'Content-Type: application/json' \
  -d '{"projectDir":"/tmp/path/from/upload"}'
```

For convenience a small helper script is provided. After starting the server,
run:

```bash
make example
```

This will zip the sample project under `test_data/simple`, upload it, trigger
the conversion and copy the resulting `converted.zip` to the current directory.

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

## Express Project Generation (Plan Step 5)

Use `generate_express.js` to create a basic Express application from a PHP
project. The generator scans the PHP code, extracts discovered routes and SQL
queries, and produces a runnable Node.js project under a `generated/` directory
by default.

```bash
npm run generate -- test_data/simple
```

The output contains `app.js`, route modules and a placeholder `db.js` if any
SQL queries were found.

## Running and Testing the Generated Server (Plan Step 6)

`test_generated.js` generates the Express project and starts it on a
temporary port. The script then performs HTTP requests to each detected route
to ensure the server responds correctly.

Run it with the bundled test project:

```bash
npm test
```

This command converts `test_data/simple`, launches the server and prints the
status code for every detected route.

## Packaging the Generated Project (Plan Step 7)

`package_output.js` wraps the generation step and creates a zip archive with a
README and a migration report. Use it like so:

```bash
npm run package -- test_data/simple
```

This produces `converted.zip` in the current directory containing the generated
Express project, which you can unzip and run with `npm install` and
`npm start`.

## CLI Helper

For quick commands you can use the simple CLI script:

```bash
# convert a PHP project and create converted.zip
node app/cli.js convert test_data/simple

# start the upload service
node app/cli.js serve
```

## Minimal User Interaction (Plan Step 8)

The upload service also exposes a `/convert` endpoint that runs the full
conversion pipeline. Send a JSON body with `projectDir` pointing to a directory
obtained via `/upload` or `/clone`. The service responds with the path to the
generated archive.

Example using a previously uploaded project:

```bash
curl -X POST http://localhost:3000/convert \
  -H 'Content-Type: application/json' \
  -d '{"projectDir":"/tmp/uploads/abcd"}'
```

The response contains the absolute path to `converted.zip` which can be
downloaded or copied for further use.

## Automated Tests and Linting (Plan Step 6)

Run the basic code quality checks and sample conversion test with:

```bash
npm run lint
npm test
```

GitHub Actions executes the same commands automatically for each pull request.

## Limitations and Next Steps (Plan Step 9)

This MVP targets simple PHP sites without heavy frameworks. Only basic route
patterns and direct MySQL queries are handled, so manual tweaks might be needed
for complex projects. The service expects Node.js 16 or newer and a local MySQL
instance when running the generated code.

Possible future improvements include:

- Support for popular PHP frameworks and routing libraries
- Compatibility with additional databases like PostgreSQL
- More comprehensive automated tests for generated applications

These enhancements are out of scope for the initial MVP but would expand the
range of projects that can be converted automatically.
