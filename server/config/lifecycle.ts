import type { Server as HttpServer } from 'http';
import { logger } from './logger';
import { captureError, flushErrorTracking } from './errorTracking';
import { pool } from './db';
import { getIO } from './socket';
import { stopQueue } from '../queue/boss';

// INF-04: the stop signal was previously handled by stopping the job queue and
// calling process.exit(0) immediately. Everything else was cut mid-flight on
// every deploy and restart: in-progress HTTP requests got no response, open
// transactions were killed (the database rolls them back, but the client never
// learns the outcome), Socket.IO clients saw an abrupt drop rather than a clean
// disconnect, and pooled connections were abandoned rather than ended.
//
// The order below matters. Stop taking new work first, then drain, then close
// the things the drain still needs — closing the pool while a request is still
// running would turn a clean shutdown into a burst of 500s.
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10);

let shuttingDown = false;

const registerLifecycle = (server: HttpServer): void => {
  const shutdown = async (signal: string): Promise<void> => {
    // A second SIGTERM (an impatient orchestrator, or SIGINT twice from a
    // terminal) must not start a second concurrent teardown.
    if (shuttingDown) {
      logger.warn({ signal }, 'Shutdown already in progress — ignoring repeat signal');
      return;
    }
    shuttingDown = true;
    logger.info({ signal, timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'Graceful shutdown started');

    // Hard deadline. If any step below hangs (a request that never finishes, a
    // socket that will not close), the platform would eventually SIGKILL us
    // anyway — better to exit on our own terms, with a log line saying so.
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    // Do not let this timer alone keep the event loop alive if everything
    // else finishes early.
    forceExit.unref();

    try {
      // 1. Stop accepting new connections. Existing ones keep going until
      //    their current response is sent.
      await new Promise<void>(resolve => server.close(() => resolve()));
      logger.info('HTTP server closed to new connections');

      // 2. Disconnect Socket.IO clients cleanly so the browser's reconnect
      //    logic fires immediately instead of waiting for a ping timeout.
      const io = getIO();
      if (io) {
        await new Promise<void>(resolve => io.close(() => resolve()));
        logger.info('Socket.IO closed');
      }

      // 3. Let in-flight queue jobs finish and release their own connections.
      await stopQueue();
      logger.info('Job queue stopped');

      // 4. Now nothing should want a connection — end the pool.
      await pool.end();
      logger.info('Database pool drained');

      await flushErrorTracking();
      clearTimeout(forceExit);
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown');
      captureError(err, { phase: 'shutdown', signal });
      await flushErrorTracking();
      clearTimeout(forceExit);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // INF-06: neither handler existed. An unhandled rejection in Node 22 is
  // fatal by default but produced no useful record of what threw; an uncaught
  // exception left the process in an undefined state, still serving requests
  // with half-initialised module state. Both are now reported before exiting,
  // and the exit is what makes the platform restart a known-good process.
  process.on('unhandledRejection', (reason: unknown) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection — shutting down');
    captureError(reason, { fatal: true, kind: 'unhandledRejection' });
    void flushErrorTracking().then(() => process.exit(1));
  });

  process.on('uncaughtException', (err: Error) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    captureError(err, { fatal: true, kind: 'uncaughtException' });
    void flushErrorTracking().then(() => process.exit(1));
  });
};

const isShuttingDown = (): boolean => shuttingDown;

export { registerLifecycle, isShuttingDown, SHUTDOWN_TIMEOUT_MS };
