var test = require("ava");
var getFixtures = require("babel-helper-fixtures").multiple;

exports.runFixtureTests = function runFixtureTests(fixturesPath, parseFunction) {
  var fixtures = getFixtures(fixturesPath);

  Object.keys(fixtures).forEach(function (name) {
    fixtures[name].forEach(function (testSuite) {
      testSuite.tests.forEach(function (task) {
        var testFn = task.disabled ? test.skip : task.options.only ? test.only : test;

        testFn(name + "/" + testSuite.title + "/" + task.title, function () {
            try {
              return runTest(task, parseFunction);
            } catch (err) {
              err.message = name + "/" + task.actual.filename + ": " + err.message;
              throw err;
            }
          });
      });
    });
  });
};

exports.runThrowTestsWithEstree = function runThrowTestsWithEstree(fixturesPath, parseFunction) {
  var fixtures = getFixtures(fixturesPath);

  Object.keys(fixtures).forEach(function (name) {
    fixtures[name].forEach(function (testSuite) {
      testSuite.tests.forEach(function (task) {
        if (!task.options.throws) return;

        task.options.plugins = task.options.plugins || [];
        task.options.plugins.push("estree");

        var testFn = task.disabled ? test.skip : task.options.only ? test.only : test;

        testFn(name + "/" + testSuite.title + "/" + task.title, function () {
          try {
            return runTest(task, parseFunction);
          } catch (err) {
            err.message = task.actual.loc + ": " + err.message;
            throw err;
          }
        });
      });
    });
  });
};

function save(test, ast) {
  // Ensure that RegExp are serialized as strings
  const toJSON = RegExp.prototype.toJSON;
  RegExp.prototype.toJSON = RegExp.prototype.toString;
  require("fs").writeFileSync(test.expect.loc, JSON.stringify(ast, null, "  "));
  RegExp.prototype.toJSON = toJSON;
}

function runTest(test, parseFunction) {
  var opts = test.options;

  if (opts.throws && test.expect.code) {
    throw new Error("File expected.json exists although options specify throws. Remove expected.json.");
  }

  try {
    var ast = parseFunction(test.actual.code, opts);
  } catch (err) {
    if (opts.throws) {
      if (err.message === opts.throws) {
        return;
      } else {
        err.message = "Expected error message: " + opts.throws + ". Got error message: " + err.message;
        throw err;
      }
    }

    throw err;
  }

  delete ast.tokens;
  if (ast.comments && !ast.comments.length) delete ast.comments;

  if (!test.expect.code && !opts.throws && !process.env.CI) {
    test.expect.loc += "on";
    return save(test, ast);
  }

  if (opts.throws) {
    throw new Error("Expected error message: " + opts.throws + ". But parsing succeeded.");
  } else {
    var mis = misMatch(JSON.parse(test.expect.code), ast);
    if (mis) {
      //save(test, ast);
      throw new Error(mis);
    }
  }
}

function ppJSON(v) {
  v = v instanceof RegExp ? v.toString() : v;
  return JSON.stringify(v, null, 2);
}

function addPath(str, pt) {
  if (str.charAt(str.length - 1) == ")") {
    return str.slice(0, str.length - 1) + "/" + pt + ")";
  } else {
    return str + " (" + pt + ")";
  }
}

function misMatch(exp, act) {
  if (exp instanceof RegExp || act instanceof RegExp) {
    var left = ppJSON(exp), right = ppJSON(act);
    if (left !== right) return left + " !== " + right;
  } else if (Array.isArray(exp)) {
    if (!Array.isArray(act)) return ppJSON(exp) + " != " + ppJSON(act);
    if (act.length != exp.length) return "array length mismatch " + exp.length + " != " + act.length;
    for (var i = 0; i < act.length; ++i) {
      var mis = misMatch(exp[i], act[i]);
      if (mis) return addPath(mis, i);
    }
  } else if (!exp || !act || (typeof exp != "object") || (typeof act != "object")) {
    if (exp !== act && typeof exp != "function")
      return ppJSON(exp) + " !== " + ppJSON(act);
  } else  {
    for (var prop in exp) {
      var mis = misMatch(exp[prop], act[prop]);
      if (mis) return addPath(mis, prop);
    }

    for (var prop in act) {
      if (prop === "__clone") {
        continue;
      }

      if (!(prop in exp) && act[prop] !== undefined) {
        return `Did not expect a property '${prop}'`;
      }
    }
  }
}
