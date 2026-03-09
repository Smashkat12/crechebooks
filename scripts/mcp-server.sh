#!/bin/bash
# MCP Server wrapper that uses local node_modules for real embeddings
# This ensures @claude-flow/embeddings with @xenova/transformers is used

cd "$(dirname "$0")/.."

# Use local node_modules
export NODE_PATH="$(pwd)/node_modules:$NODE_PATH"

# Run the local claude-flow MCP server
exec node_modules/.bin/claude-flow mcp start "$@"
