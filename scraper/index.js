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
        const hourMatch = dateHour.match(/H\d{2}/);
        const hour = hourMatch ? hourMatch[0] : '';
        let priceRaw = $(tds[13]).text().trim();
        let price = parseFloat(priceRaw.replace(',', '.'));
        if (dateHour && hour && !isNaN(price)) {
          const point = new Point('scraped_prices')
            .tag('hour', hour)
            .stringField('dateHour', dateHour)
            .floatField('price', price)
            .timestamp(new Date());
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

// Schedule to run every day at 02:00 AM
cron.schedule('0 15 * * *', scrapeAndStore);

// For testing: run once on startup
scrapeAndStore();
