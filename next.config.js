/** @type {import('next').NextConfig} */

const path = require('path');

const nextConfig = {
    webpack: (config) => {        
        return config;
    },
    turbopack: {}
}
module.exports = nextConfig
