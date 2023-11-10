#!/bin/bash

# Clone the repository
git clone https://github.com/tobiasmidskards/gitgpt.git
cd gitgpt

# Prompt for the OpenAI API key
read -p "Enter your OpenAI API key: " openai_key

# Create or update the .env file with the provided key
echo "OPENAI_API_KEY=$openai_key" > .env

# Install the dependencies
npm install -g
