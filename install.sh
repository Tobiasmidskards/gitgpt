#!/bin/bash

set -e

rm -rf gitgpt

echo "Cloning the repository..."
git clone https://github.com/tobiasmidskards/gitgpt.git
echo "Cloned the repository."

echo "Changing directory to gitgpt..."
cd gitgpt
echo "Changed directory to gitgpt."

echo "Asking for your OpenAI API key..."
read -p "Enter your OpenAI API key: " openai_key
echo "Got your OpenAI API key."

# Create or update the .env file with the provided key
echo "OPENAI_API_KEY=$openai_key" > .env
echo "Created or updated the .env file."


echo "Installing the dependencies..."
# Install the dependencies
npm install
echo "Installed the dependencies."
