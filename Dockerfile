FROM node:6.9.4
MAINTAINER hellotech

WORKDIR /usr/src/app/

COPY . /usr/src/app

RUN npm install


CMD ["node", "server.js"]