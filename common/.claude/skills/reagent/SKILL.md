---
name: reagent-review
description: Use this when you want to create or get a Reagent Review Session. Example requests: 'Lets create a review session for the changes youve made' 'Create a review session for the plan you wrote in the md file' 'Get me the results of review session f886d25a-38c9-454e-ba5d-491af064e326' 'Get me
the comments from the latest review session'
---

# ReAgent Review

## Purpose

This skill gives you the ability to create a review session to collect 
feedback from the user.

## Workflow

For any review session, the following happens:

1. User requests a review session
1. You create the review session using ReAgent
1. User gives feedback on the ReAgent UI on the browser
1. You get the results of the review session

Usually the user will request you to do something with the feedback
such as updating the code or whathever was reviewed.

## Prerequisites

Before you do anything, we need to ensure the ReAgent server is running.

For that follow this:
- Check if it is running with `reagent status`
  - If it is running, you're done
  - If not, then start the server with `reagent start -d`

## Cookbook

IMPORTANT: Make sure you go through the prerequisites first.

- IF: you need to create a new review session
- THEN: You use the `reagent review` command. 
  - Run `--help` to get the available options
  - Based on the user request, you pick which `--source` to use
  - You should ALWAYS create a proper `title` and `description`
  - Unless the user tells you explicitely not to, you should not pass the `--no-open` flag flag

- IF: you need to get the review session
- THEN: You use the `reagent get` command. 
  - Run `--help` to know how to use it.
  - If the user wants, you can use the '--wait' flag to block until the review get's finished.
  - Don't use the JSON flag.

- IF: you need to list all existing review sessions.
- THEN: You should use the `reagent list` command
  - Sessions should be sorted by creation ASC so you can use that to get the latest one.
