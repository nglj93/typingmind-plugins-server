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

const fetchAndCleanContent = async (url: string) => {
  const browser = await chromium.launch({ headless: true }); // Launch Playwright
  const page = await browser.newPage(); // Create a new page
  await page.goto(url, { waitUntil: 'networkidle' }); // Navigate to the URL

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

  await browser.close(); // Close the browser

  return { title, content }; // Return title and content
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
      const content = await fetchAndCleanContent(url);
      const serviceResponse = new ServiceResponse(
        ResponseStatus.Success,
        'Service is healthy',
        content,
        StatusCodes.OK
      );
      handleServiceResponse(serviceResponse, res);
      return;
    } catch (error) {
      console.error(`Error fetching content ${(error as Error).message}`);
      const errorMessage = `Error fetching content ${(error as Error).message}`;
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
