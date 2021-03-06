var sass = require("node-sass");
var semver = require("semver");
var css2rn = require("css-to-react-native-transform").default;
var path = require("path");
var fs = require("fs");
var appRoot = require("app-root-path");

var upstreamTransformer = null;

var reactNativeVersionString = require("react-native/package.json").version;
var reactNativeMinorVersion = semver(reactNativeVersionString).minor;

if (reactNativeMinorVersion >= 56) {
  upstreamTransformer = require("metro/src/reactNativeTransformer");
} else if (reactNativeMinorVersion >= 52) {
  upstreamTransformer = require("metro/src/transformer");
} else if (reactNativeMinorVersion >= 47) {
  upstreamTransformer = require("metro-bundler/src/transformer");
} else if (reactNativeMinorVersion === 46) {
  upstreamTransformer = require("metro-bundler/build/transformer");
} else {
  // handle RN <= 0.45
  var oldUpstreamTransformer = require("react-native/packager/transformer");
  upstreamTransformer = {
    transform({ src, filename, options }) {
      return oldUpstreamTransformer.transform(src, filename, options);
    }
  };
}

// Iterate through the include paths and extensions to find the file variant
function findVariant(name, extensions, includePaths) {
  for (let i = 0; i < includePaths.length; i++) {
    const includePath = includePaths[i];

    // try to find the file iterating through the extensions, in order.
    const foundExtention = extensions.find(extension => {
      const fname = includePath + "/" + name + extension;
      const partialfname = includePath + "/_" + name + extension;
      return fs.existsSync(fname) || fs.existsSync(partialfname);
    });

    if (foundExtention) {
      return includePath + "/" + name + foundExtention;
    }
  }

  return false;
}

module.exports.transform = function(src, filename, options) {
  if (typeof src === "object") {
    // handle RN >= 0.46
    ({ src, filename, options } = src);
  }

  if (filename.endsWith(".scss") || filename.endsWith(".sass")) {
    const ext = path.extname(filename);
    const exts = [
      // add the platform specific extension, first in the array to take precedence
      options.platform === "android" ? ".android" + ext : ".ios" + ext,
      ".native" + ext,
      ext
    ];
    var defaultOpts = {
      includePaths: [path.dirname(filename), appRoot],
      indentedSyntax: filename.endsWith(".sass"),
      importer: function(url /*, prev, done */) {
        // url is the path in import as is, which LibSass encountered.
        // prev is the previously resolved path.
        // done is an optional callback, either consume it or return value synchronously.
        // this.options contains this options hash, this.callback contains the node-style callback

        const urlPath = path.parse(url);
        const importerOptions = this.options;
        const incPaths = importerOptions.includePaths.slice(0).split(":");

        if (urlPath.dir.length > 0) {
          incPaths.unshift(path.resolve(path.dirname(filename), urlPath.dir)); // add the file's dir to the search array
        }
        const f = findVariant(urlPath.name, exts, incPaths);

        if (f) {
          return { file: f };
        }

        return new Error(url + " could not be resolved in " + incPaths);
      }
    };

    var opts = options.sassOptions
      ? Object.assign(defaultOpts, options.sassOptions, { data: src })
      : Object.assign(defaultOpts, { data: src });

    var result = sass.renderSync(opts);
    var css = result.css.toString();
    var cssObject = css2rn(css, { parseMediaQueries: true });

    return upstreamTransformer.transform({
      src: "module.exports = " + JSON.stringify(cssObject),
      filename,
      options
    });
  }
  return upstreamTransformer.transform({ src, filename, options });
};
