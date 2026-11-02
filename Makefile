.PHONY: setup setup-yes test build stats clean

# Default target runs guided interactive setup
all: setup

setup:
	bash ./setup.sh

setup-yes:
	bash ./setup.sh -y

build:
	npm install && npm run build

test:
	npm test

stats:
	npm run stats

telemetry:
	npm run telemetry:web
