const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

// InfluxDB 2.x config from environment
const INFLUX_URL = process.env.INFLUX_URL || 'http://influxdb:8086';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || 'my-super-secret-token';
const INFLUX_ORG = process.env.INFLUX_ORG || 'my-org';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'scraperdb';

const influxDB = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
const writeApi = influxDB.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ns');

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
    let count = 0;
    rows.each((i, row) => {
      const tds = $(row).find('td');
      if (tds.length > 0) {
        const dateHour = $(tds[0]).text().trim();
        
        // Extract date and hour from the format like "2025-11-22 H01"
        const dateMatch = dateHour.match(/(\d{4}-\d{2}-\d{2})\s+H(\d{2})/);
        if (!dateMatch) return;
        
        const dateStr = dateMatch[1]; // e.g., "2025-11-22"
        const hourNum = parseInt(dateMatch[2], 10); // e.g., 1 from "H01"
        const hour = dateMatch[0].match(/H\d{2}/)[0]; // e.g., "H01"
        
        // Parse price from column 13
        let priceRaw = $(tds[13]).text().trim();
        let price = parseFloat(priceRaw.replace(',', '.'));
        
        if (!isNaN(price) && dateStr && !isNaN(hourNum)) {
          // Create a proper timestamp for when this price is valid
          // Hour 1 = 00:00-01:00, Hour 2 = 01:00-02:00, etc.
          const timestamp = new Date(`${dateStr}T${String(hourNum - 1).padStart(2, '0')}:00:00.000Z`);
          
          const point = new Point('electricity_price')
            .tag('hour', hour)  // Keep hour tag for easy filtering (H01-H24)
            .floatField('price', price)
            .timestamp(timestamp);
          
          writeApi.writePoint(point);
          count++;
        }
      }
    });
    await writeApi.flush();
    if (count > 0) {
      console.log(`Scraped and stored ${count} rows at`, new Date());
    } else {
      console.log('No valid data found to store.');
    }
  } catch (err) {
    console.error('Scraping error:', err);
  }
}

// Schedule to run every day at 3 PM
cron.schedule('0 15 * * *', scrapeAndStore);

// For testing: run once on startup
scrapeAndStore();
