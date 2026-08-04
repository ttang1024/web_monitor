import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		// The SDK is a browser library: it needs window, document and navigator.
		environment: 'jsdom',
		include: ['*.test.js'],
	},
})
