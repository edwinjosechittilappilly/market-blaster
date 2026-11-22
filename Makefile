MKDOCS := uvx --with mkdocs-material mkdocs
SLIPWAY_DIR ?= ../slipway

.PHONY: help install test typecheck docs docs-serve diagrams check

help:
	@printf '%s\n' 'install      Install dependencies and link mblast' 'test         Run tests' 'typecheck    Check TypeScript types' 'docs         Build documentation in strict mode' 'docs-serve   Serve documentation locally' 'diagrams     Generate architecture diagrams' 'check        Run tests, typecheck and docs'

install:
	npm ci && npm link

test:
	npm test

typecheck:
	npm run typecheck

docs:
	$(MKDOCS) build --strict

docs-serve:
	$(MKDOCS) serve

diagrams:
	python3 $(SLIPWAY_DIR)/skills/arch-diagram/scripts/diagram.py docs/diagrams/architecture.json -o docs/diagrams/architecture

check: test typecheck docs
