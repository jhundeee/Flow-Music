if (import.meta.env.DEV) {
  const devtoolsMsg = 'Download the React DevTools';
  for (const method of ['info', 'log']) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      if (typeof args[0] === 'string' && args[0].includes(devtoolsMsg)) return;
      original(...args);
    };
  }
}
