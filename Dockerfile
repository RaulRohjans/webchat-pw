FROM node:latest
WORKDIR /pwchat
COPY package.json /pwchat
RUN npm install
COPY . /pwchat
CMD ["npm", "start"]
