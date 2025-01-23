FROM --platform=linux/amd64 node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# 使用 PM2 啟動伺服器
RUN npm install pm2 -g
CMD ["pm2-runtime", "index.js"]
