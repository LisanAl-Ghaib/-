#!/bin/bash
set -e

SERVER=${SERVER:-http://localhost:3000}
TMPDIR=$(mktemp -d)
ZIP=$TMPDIR/project.zip

# create zip of test data
zip -r -q "$ZIP" test_data/simple

# upload archive
RESP=$(curl -s -F "archive=@$ZIP" "$SERVER/upload")
DIR=$(echo $RESP | grep -o '"saved":"[^"]*"' | cut -d'"' -f4)
if [ -z "$DIR" ]; then
  echo "Upload failed" && exit 1
fi

echo "Uploaded to $DIR"

# convert
RESP=$(curl -s -H "Content-Type: application/json" -d "{\"projectDir\":\"$DIR\"}" "$SERVER/convert")
ARCHIVE=$(echo $RESP | grep -o '"archive":"[^"]*"' | cut -d'"' -f4)
if [ -z "$ARCHIVE" ]; then
  echo "Conversion failed" && exit 1
fi

cp "$ARCHIVE" ./converted.zip

echo "Conversion complete. Archive copied to ./converted.zip"

rm -rf "$TMPDIR"
