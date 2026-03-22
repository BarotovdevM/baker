# Bakeri

A simple bakery website built with Node.js and Express.

## Project Structure

- `server.js` - Express server serving static files on port 5000
- `public/index.html` - Main HTML page for the bakery site
- `package.json` - Node.js project configuration

## Tech Stack

- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Frontend**: Plain HTML/CSS (no build step)

## Running the App

The app starts via the "Start application" workflow, which runs:

```
node server.js
```

The server listens on `0.0.0.0:5000`.

## Deployment

Configured for autoscale deployment running `node server.js`.
