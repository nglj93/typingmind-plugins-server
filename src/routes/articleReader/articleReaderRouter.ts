import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import express, { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { chromium } from 'playwright'; // Change to Playwright

import { createApiResponse } from '@/api-docs/openAPIResponseBuilders';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { handleServiceResponse } from '@/common/utils/httpHandlers';

import { ArticleReaderSchema } from './articleReaderModel';

export const articleReaderRegistry = new OpenAPIRegistry();
articleReaderRegistry.register('ArticleReader', ArticleReaderSchema);

const featchCleanContentFromFirecrawl = async (url: string) => {
  const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
  try {
    const headers = {
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    };
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers,
      body: JSON.stringify({ url, formats: ['markdown'] }),
    });
    if (!response.ok) {
      console.error(await response.json());
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (data.success) {
      return data.data;
    } else {
      throw new Error('Failed to extract content using FireCrawl');
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const fetchAndCleanContent = async (url: string) => {
  const browser = await chromium.launch({ headless: true }); // Launch Playwright
  let page; // Declare page variable outside the try block

  const extractContent = async (page: any) => {
    const title = await page.title(); // Get the title
    const content = await page.evaluate(() => {
      // Remove unwanted elements
      const elementsToRemove = [
        'footer',
        'header',
        'nav',
        'script',
        'style',
        'link',
        'meta',
        'noscript',
        'img',
        'picture',
        'video',
        'audio',
        'iframe',
        'object',
        'embed',
        'param',
        'track',
        'source',
        'canvas',
        'map',
        'area',
        'svg',
        'math',
      ];
      elementsToRemove.forEach((element) => {
        const el = document.querySelector(element);
        if (el) el.remove();
      });
      return document.body.innerText; // Return the cleaned text content
    });
    return { title, content }; // Return title and content
  };

  try {
    page = await browser.newPage(); // Create a new page

    // Set a shorter timeout for the page to load
    const timeout = 10000; // 10 seconds
    await page.goto(url, { waitUntil: 'networkidle', timeout }); // Navigate to the URL

    // If the page loads successfully, extract the title and content
    return await extractContent(page); // Use the helper function
  } catch (error: unknown) {
    // Define the type of error here
    const typedError = error as Error; // Cast to Error

    console.error(`Error fetching content: ${typedError.message}`);

    // If it's a timeout error, try to extract the content anyway
    if (typedError.message.includes('Timeout')) {
      console.warn('Timeout occurred, attempting to extract content anyway.');
      try {
        return await extractContent(page); // Use the helper function
      } catch (extractionError: unknown) {
        // Define the type of extractionError here
        const typedExtractionError = extractionError as Error; // Cast to Error
        console.error(`Failed to extract content after timeout: ${typedExtractionError.message}`);
      }
    }

    throw error; // Rethrow the error to be handled in the router
  } finally {
    await browser.close(); // Ensure the browser is closed
  }
};

export const articleReaderRouter: Router = (() => {
  const router = express.Router();

  articleReaderRegistry.registerPath({
    method: 'get',
    path: '/content',
    tags: ['Article Reader'],
    responses: createApiResponse(ArticleReaderSchema, 'Success'),
  });

  router.get('/', async (_req: Request, res: Response) => {
    const { url } = _req.query;

    if (typeof url !== 'string') {
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Failed,
        'URL must be a string',
        null,
        StatusCodes.BAD_REQUEST
      );
      handleServiceResponse(serviceResponse, res);
      return;
    }

    try {
      let content = await fetchAndCleanContent(url);

      // check if the body contain "Verify you are human by completing"
      // rerun the scrap using firecrawl api
      const pattern = 'Verifying you are human by completing';
      if (content.content.includes(pattern)) {
        console.warn('Human verification required, attempting to extract content using Firecrawl API.');
        // Call the Firecrawl API
        content = await featchCleanContentFromFirecrawl(url);
      }

      const serviceResponse = new ServiceResponse(
        ResponseStatus.Success,
        'Service is healthy',
        content,
        StatusCodes.OK
      );
      handleServiceResponse(serviceResponse, res);
      return;
    } catch (error) {
      const errorMessage = `Error fetching content: ${(error as Error).message}`;
      console.error(errorMessage);
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Failed,
        errorMessage,
        null,
        StatusCodes.INTERNAL_SERVER_ERROR
      );

      handleServiceResponse(serviceResponse, res);
      return;
    }
  });

  return router;
})();
