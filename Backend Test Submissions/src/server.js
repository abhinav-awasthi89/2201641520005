const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const { Log } = require('../../Logging Middleware/src');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for URLs
const urlDatabase = new Map();

/**
 * Generate a unique short code
 */
function generateShortCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Validate custom shortcode
 */
function isValidShortcode(shortcode) {
  return /^[a-zA-Z0-9]{3,20}$/.test(shortcode);
}

/**
 * Calculate expiry date from validity minutes
 */
function calculateExpiry(validityMinutes = 30) {
  const now = new Date();
  const expiry = new Date(now.getTime() + validityMinutes * 60 * 1000);
  return expiry.toISOString();
}

/**
 * Check if URL has expired
 */
function isExpired(expiryDate) {
  return new Date() > new Date(expiryDate);
}

/**
 * Get mock geographical location based on IP
 */
function getLocationFromIP(ip) {
  // Mock location data for demo purposes
  const mockLocations = [
    { country: 'United States', city: 'New York' },
    { country: 'United Kingdom', city: 'London' },
    { country: 'Germany', city: 'Berlin' },
    { country: 'India', city: 'Mumbai' },
    { country: 'Canada', city: 'Toronto' }
  ];
  
  if (!ip || ip === 'Unknown' || ip === '::1' || ip === '127.0.0.1') {
    return { country: 'Unknown', city: 'Unknown' };
  }
  
  // Simple hash-based mock location assignment
  const hash = ip.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  return mockLocations[Math.abs(hash) % mockLocations.length];
}

/**
 * Create Short URL Endpoint
 * POST /shorturls
 */
app.post('/shorturls', async (req, res) => {
  try {
    console.log('Request body:', req.body); // Debug log
    
    // Log the incoming request
    await Log('BACKEND', 'INFO', 'URL_SHORTENER', `Creating short URL for: ${req.body.url || 'undefined'}`);
    
    const { url, validity, shortcode } = req.body;

    // Validate required URL parameter
    if (!url) {
      console.log('Missing URL parameter');
      await Log('BACKEND', 'ERROR', 'URL_SHORTENER', 'URL parameter missing in request');
      return res.status(400).json({
        error: 'URL is required',
        message: 'Please provide a valid URL to shorten'
      });
    }

    // Validate URL format
    if (!validator.isURL(url, { require_protocol: true })) {
      console.log('Invalid URL format:', url);
      await Log('BACKEND', 'ERROR', 'URL_SHORTENER', `Invalid URL format: ${url}`);
      return res.status(400).json({
        error: 'Invalid URL format',
        message: 'Please provide a valid URL with protocol (http:// or https://)'
      });
    }

    // Validate validity parameter if provided
    let validityMinutes = 30; // default
    if (validity !== undefined) {
      if (!Number.isInteger(validity) || validity <= 0) {
        return res.status(400).json({
          error: 'Invalid validity period',
          message: 'Validity must be a positive integer representing minutes'
        });
      }
      validityMinutes = validity;
    }

    // Handle custom shortcode
    let finalShortcode;
    if (shortcode) {
      // Validate custom shortcode format
      if (!isValidShortcode(shortcode)) {
        return res.status(400).json({
          error: 'Invalid shortcode format',
          message: 'Shortcode must be alphanumeric and 3-20 characters long'
        });
      }

      // Check if custom shortcode already exists
      if (urlDatabase.has(shortcode)) {
        return res.status(409).json({
          error: 'Shortcode already exists',
          message: 'The provided shortcode is already in use. Please choose a different one.'
        });
      }

      finalShortcode = shortcode;
    } else {
      // Generate unique shortcode
      do {
        finalShortcode = generateShortCode();
      } while (urlDatabase.has(finalShortcode));
    }

    // Calculate expiry
    const expiryDate = calculateExpiry(validityMinutes);

    // Store in database
    const urlEntry = {
      id: uuidv4(),
      originalUrl: url,
      shortcode: finalShortcode,
      expiry: expiryDate,
      createdAt: new Date().toISOString(),
      clickCount: 0,
      clicks: [] // Array to store detailed click data
    };

    urlDatabase.set(finalShortcode, urlEntry);

    // Build short URL with proper host
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${PORT}`;
    const shortLink = `${protocol}://${host}/${finalShortcode}`;

    console.log('Successfully created:', shortLink);

    // Log successful creation
    await Log('BACKEND', 'INFO', 'URL_SHORTENER', `Successfully created short URL: ${shortLink}`);

    // Return response
    res.status(201).json({
      shortLink,
      expiry: expiryDate
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create short URL'
    });
  }
});

/**
 * Retrieve Short URL Statistics Endpoint
 * GET /shorturls/:shortcode
 */
app.get('/shorturls/:shortcode', async (req, res) => {
  try {
    const { shortcode } = req.params;

    // Log the statistics request
    await Log('BACKEND', 'INFO', 'URL_SHORTENER', `Retrieving statistics for shortcode: ${shortcode}`);

    // Validate shortcode format
    if (!isValidShortcode(shortcode)) {
      await Log('BACKEND', 'ERROR', 'URL_SHORTENER', `Invalid shortcode format in statistics request: ${shortcode}`);
      return res.status(400).json({
        error: 'Invalid shortcode format',
        message: 'Shortcode must be alphanumeric and 3-20 characters long'
      });
    }

    // Check if shortcode exists
    const urlEntry = urlDatabase.get(shortcode);
    if (!urlEntry) {
      await Log('BACKEND', 'ERROR', 'URL_SHORTENER', `Statistics requested for non-existent shortcode: ${shortcode}`);
      return res.status(404).json({
        error: 'Short URL not found',
        message: 'The requested short URL does not exist'
      });
    }

    // Return statistics
    const statistics = {
      totalClicks: urlEntry.clickCount,
      originalUrl: urlEntry.originalUrl,
      creationDate: urlEntry.createdAt,
      expiryDate: urlEntry.expiry,
      clickDetails: urlEntry.clicks.map(click => ({
        timestamp: click.timestamp,
        referer: click.referer,
        userAgent: click.userAgent,
        location: click.location
      }))
    };

    await Log('BACKEND', 'INFO', 'URL_SHORTENER', `Statistics retrieved for ${shortcode} - Total clicks: ${urlEntry.clickCount}`);

    res.status(200).json(statistics);

  } catch (error) {
    console.error('Statistics error:', error.message);
    await Log('BACKEND', 'ERROR', 'URL_SHORTENER', `Statistics error for ${req.params.shortcode}: ${error.message}`);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve statistics'
    });
  }
});

/**
 * Redirect Short URL Endpoint
 * GET /:shortcode
 */
app.get('/:shortcode', async (req, res) => {
  try {
    const { shortcode } = req.params;

    // Validate shortcode format
    if (!isValidShortcode(shortcode)) {
      return res.status(400).json({
        error: 'Invalid shortcode format',
        message: 'Shortcode must be alphanumeric and 3-20 characters long'
      });
    }

    // Check if shortcode exists
    const urlEntry = urlDatabase.get(shortcode);
    if (!urlEntry) {
      return res.status(404).json({
        error: 'Short URL not found',
        message: 'The requested short URL does not exist'
      });
    }

    // Check if URL has expired
    if (isExpired(urlEntry.expiry)) {
      return res.status(410).json({
        error: 'Short URL expired',
        message: 'This short URL has expired and is no longer valid'
      });
    }

    // Record detailed click information
    const clickData = {
      timestamp: new Date().toISOString(),
      userAgent: req.get('User-Agent') || 'Unknown',
      referer: req.get('Referer') || 'Direct',
      ip: req.ip || req.connection.remoteAddress || 'Unknown',
      // Simple geographical location based on IP (mock data for demo)
      location: getLocationFromIP(req.ip || req.connection.remoteAddress)
    };

    // Update click count and add click data
    urlEntry.clickCount++;
    urlEntry.clicks.push(clickData);

    // Log the redirect
    await Log('BACKEND', 'INFO', 'URL_SHORTENER', `Redirecting ${shortcode} to ${urlEntry.originalUrl} - Click #${urlEntry.clickCount}`);

    console.log(`Redirecting ${shortcode} to ${urlEntry.originalUrl}`);

    // Redirect to original URL
    res.redirect(urlEntry.originalUrl);

  } catch (error) {
    console.error('Redirect error:', error.message);
    await Log('BACKEND', 'ERROR', 'URL_SHORTENER', `Redirect error for ${req.params.shortcode}: ${error.message}`);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process redirect'
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: 'The requested endpoint does not exist'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 URL Shortener microservice running on http://localhost:${PORT}`);
});

module.exports = app;