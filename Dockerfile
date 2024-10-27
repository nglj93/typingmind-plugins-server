# Use a base image that includes Playwright and its dependencies
FROM mcr.microsoft.com/playwright:v1.20.0-focal

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm ci

# Install Playwright browsers
RUN npx playwright install

# Bundle app source
COPY . .

# Build the TypeScript files
RUN npm run build

# Expose port 8080
EXPOSE 8080

# Start the app
CMD ["npm", "run", "start"]
