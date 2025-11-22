const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const Influx = require('influx');

// Configure InfluxDB connection
const influx = new Influx.InfluxDB({
  host: process.env.INFLUX_HOST || 'influxdb',
  database: process.env.INFLUX_DB || 'scraperdb',
  username: process.env.INFLUX_USER || 'admin',
  password: process.env.INFLUX_PASS || 'changeme',
});

// Create database if not exists
influx.getDatabaseNames().then(names => {
  if (!names.includes(process.env.INFLUX_DB || 'scraperdb')) {
    return influx.createDatabase(process.env.INFLUX_DB || 'scraperdb');
  }
});

// Scraper function
async function scrapeAndStore() {
  try {
    const response = await axios.get('https://tge.pl/energia-elektryczna-rdn?type=1', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive'
      },
      timeout: 10000
    });
    const $ = cheerio.load(response.data);
    const rows = $('table tr');
    let points = [];
    rows.each((i, row) => {
      const tds = $(row).find('td');
      if (tds.length > 0) {
        const dateHour = $(tds[0]).text().trim();
        // Extract hour (e.g., H01) from dateHour string
        const hourMatch = dateHour.match(/H\d{2}/);
        const hour = hourMatch ? hourMatch[0] : '';
        // The price is the 13th td (index 12) in your sample (adjust if needed)
        let priceRaw = $(tds[13]).text().trim();
        // Replace comma with dot for decimal
        let price = parseFloat(priceRaw.replace(',', '.'));
        if (dateHour && hour && !isNaN(price)) {
          points.push({
            measurement: 'scraped_prices',
            tags: { hour },
            fields: { price },
            timestamp: new Date(),
          });
        }
      }
    });
    if (points.length > 0) {
      await influx.writePoints(points);
      console.log('Points to be written to InfluxDB:', points);
      console.log(`Scraped and stored ${points.length} rows at`, new Date());
    } else {
      console.log('No valid data found to store.');
    }
  } catch (err) {
    console.error('Scraping error:', err);
  }
}

// Schedule to run every day at 02:00 AM
cron.schedule('0 15 * * *', scrapeAndStore);

// For testing: run once on startup
scrapeAndStore();
