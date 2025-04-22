/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer, webpack }) => {

    // Mark duckdb (native) as external ONLY for the server build
    if (isServer) {
        const originalExternals = Array.isArray(config.externals) ? config.externals : [];
        config.externals = [...originalExternals, 'duckdb'];
        console.log('Marked duckdb (native) as external for server build.');
    }

    // Ignore optional WebSocket dependencies that might cause issues
    config.plugins = config.plugins || [];
    config.plugins.push(
        new webpack.IgnorePlugin({
            resourceRegExp: /^(bufferutil|utf-8-validate)$/,
        })
    );
    console.log('Applied webpack IgnorePlugin for bufferutil, utf-8-validate');

    return config;
  },
};

export default nextConfig;
