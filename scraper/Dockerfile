# Use official Node.js image (arm64 for Orange Pi)
FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

CMD ["npm", "start"]
