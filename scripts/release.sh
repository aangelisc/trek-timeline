#!/bin/bash

GITHUB_TOKEN=$(gh auth token)

Help() {
    echo "Usage: $0 [-h]"
    echo "Options:"
    echo "  -h    Display this help message"
    echo "  -b    Run bootstrap"
    echo "  -u    Run update release"
    echo "  -m    Run make release"
}

Bootstrap() {
    echo "Running bootstrap..."
    release-please bootstrap \
      --token=$GITHUB_TOKEN \
      --repo-url=aangelisc/trek-timeline \
      --release-type=node --package-name trek-timeline --initial-version 0.1.0 
    echo "Bootstrap completed."
}

UpdateRelease() {
    echo "Running update release..."
    release-please release-pr \
      --token=$GITHUB_TOKEN \
      --repo-url=aangelisc/trek-timeline
    echo "Update release completed."
}

MakeRelease() {
    echo "Running make release..."
    release-please github-release \
      --token=$GITHUB_TOKEN \
      --repo-url=aangelisc/trek-timeline
    echo "Make release completed."
}

while getopts "hbum" option; do
   case $option in
      h)
         Help
         exit;;
      b)
         Bootstrap
         exit;;
      u)
         UpdateRelease
         exit;;
      m)
         MakeRelease
         exit;;
      \?)
         echo "Error: Invalid option"
         exit;;
   esac
done
