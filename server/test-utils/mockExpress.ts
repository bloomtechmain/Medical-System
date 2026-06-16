import { Request, Response } from 'express';

const mockResponse = (): Response => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res as Response;
};

const mockRequest = (overrides: Partial<Request> = {}): Request =>
  ({ body: {}, params: {}, query: {}, ...overrides } as Request);

export { mockRequest, mockResponse };
