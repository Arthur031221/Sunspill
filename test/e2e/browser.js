import { chromium } from 'playwright'

export const launchBrowser = (engine) => engine.launch(engine === chromium && process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {})

// ResizeObserver can resize the canvas after the first frame, which queues its paint for the next one.
export const waitForPaint = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
