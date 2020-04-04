var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var fs = require("fs");

function main() {
	var filePaths = ["../checkbox.io/server-side/site/", "../checkbox.io/server-side/site/test/",
		"../checkbox.io/server-side/site/test/complexity/", "../checkbox.io/server-side/site/routes/"];

	var files = [];

	filePaths.forEach(path => {
		var tempFiles = fs.readdirSync(path).filter(x => x.includes('.js') && !x.includes('.json'));

		tempFiles.forEach(file => {
			files.push(path + file);
		});
	});

	var fail = false;

	files.forEach(file => {
		complexity(file);

		// Report
		for (var node in builders) {
			var builder = builders[node];
			builder.report();

			if (builder.MethodLength > 100 || builder.MaxMessageChains > 10 || builder.MaxNestingDepth > 5) {
				fail = true;
			}
		}
	});

	if (fail) {
		console.log('Fail!')
		process.exitCode = 1;
	}
	else {
		console.log('Pass!')
	}
}



var builders = {};

// Represent a reusable "class" following the Builder pattern.
function FunctionBuilder()
{
	this.FunctionName = "";
	this.MethodLength = 0;
	this.MaxMessageChains = 0;
	this.MaxNestingDepth    = 0;

	this.report = function()
	{
		console.log(
		   (
		   	"{0}()\n" +
		   	"============\n" +
			    "MethodLength: {1}\t" +
				"MaxMessageChains: {2}\t" +
				"MaxNestingDepth: {3}\n\n"
			)
			.format(this.FunctionName, this.MethodLength,
				this.MaxMessageChains, this.MaxNestingDepth,)
		);
	}
};

// A builder for storing file level information.
function FileBuilder()
{
	this.FileName = "";

	this.report = function()
	{
		console.log (
			( "{0}\n" +
			  "~~~~~~~~~~~~\n"
			).format( this.FileName));
	}
}

// A function following the Visitor pattern.
// Annotates nodes with parent objects.
function traverseWithParents(object, visitor)
{
    var key, child;

    visitor.call(null, object);

    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null && key != 'parent') 
            {
            	child.parent = object;
					traverseWithParents(child, visitor);
            }
        }
    }
}

function complexity(filePath)
{
	var buf = fs.readFileSync(filePath, "utf8");
	var ast = esprima.parse(buf, options);

	var i = 0;

	// A file level-builder:
	var fileBuilder = new FileBuilder();
	fileBuilder.FileName = filePath;
	fileBuilder.ImportCount = 0;
	builders[filePath] = fileBuilder;

	// Tranverse program with a function visitor.
	traverseWithParents(ast, function (node) 
	{
		if (node.type === 'FunctionDeclaration') 
		{
			var builder = new FunctionBuilder();

			builder.FunctionName = functionName(node);
			builder.MethodLength = node.loc.end.line - node.loc.start.line;
			builder.MaxMessageChain = 0;
			builder.MaxNestingDepth = 0;

			traverseWithParents(node, function (child) {

				if(child.type === "MemberExpression" && child.property.type === 'Identifier') {
					var maxChains = 0;
					traverseWithParents(child, function (grandchild) {
						if(grandchild.type === "MemberExpression" && child.property.type === 'Identifier') {
							maxChains += 1;
						}
					});
					if(maxChains > builder.MaxMessageChains) {
						builder.MaxMessageChains = maxChains;
					}
				}

				if (child.type === 'IfStatement'){
					console.log(builder.FunctionName+' '+child.type);
					res = nestDepth(child);
					console.log('\n\n');
					if (res > builder.MaxNestingDepth){
						builder.MaxNestingDepth = res;
					}
				}

			});

			builders[builder.FunctionName] = builder;
		}

	});

}

// Helper function for counting nesting
function nestDepth(child)
{
	//console.log(child.type);
	if ( !child || child.length === 0 ) {
		return 0;
	}

	if(child.type === 'IfStatement') {
		max = 0;
		//console.log(child.test.name);
		// console.log(child.consequent.body);
		if (child.consequent) {
			if (child.consequent.type === "BlockStatement") {
				child.consequent.body.forEach(obj => {
					res = nestDepth(obj);
					if (res > max) max = res;
				});

				// console.log(child.consequent.body)
				// for (obj in child.consequent) {
				// 	res = nestDepth(child.consequent.body[obj]);
				// 	// console.log("IF"+child.test.operator+res);
				// 	if(res > max) max = res;
				// }
			} else {
				//for (obj in child.consequent) {
				//console.log(obj);
				res = nestDepth(child.consequent);
				if (res > max) max = res;
				//}
			}
		}


		if (child.alternate) {
			if (child.alternate.type === "BlockStatement") {
				for (obj in child.alternate.body) {
					res = nestDepth(child.alternate.body[obj]);
					// console.log("IF"+child.test.operator+res);
					if (res > max) max = res;
				}
			} else {
				//for (obj in child.alternate) {
				res = nestDepth(child.alternate);
				if (res > max) max = res;
				//}
			}
		}
		return max+1;
	}
	else {
		return 0;
	}
}

// Helper function for counting children of node.
function childrenLength(node)
{
	var key, child;
	var count = 0;
	for (key in node) 
	{
		if (node.hasOwnProperty(key)) 
		{
			child = node[key];
			if (typeof child === 'object' && child !== null && key != 'parent') 
			{
				count++;
			}
		}
	}	
	return count;
}


// Helper function for checking if a node is a "decision type node"
function isDecision(node)
{
	if( node.type == 'IfStatement' || node.type == 'ForStatement' || node.type == 'WhileStatement' ||
		 node.type == 'ForInStatement' || node.type == 'DoWhileStatement')
	{
		return true;
	}
	return false;
}

// Helper function for printing out function name.
function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "anon function @" + node.loc.start.line;
}

// Helper function for allowing parameterized formatting of strings.
if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

main();

function Crazy (argument) 
{

	var date_bits = element.value.match(/^(\d{4})\-(\d{1,2})\-(\d{1,2})$/);
	var new_date = null;
	if(date_bits && date_bits.length == 4 && parseInt(date_bits[2]) > 0 && parseInt(date_bits[3]) > 0)
    new_date = new Date(parseInt(date_bits[1]), parseInt(date_bits[2]) - 1, parseInt(date_bits[3]));

    var secs = bytes / 3500;

      if ( secs < 59 )
      {
          return secs.toString().split(".")[0] + " seconds";
      }
      else if ( secs > 59 && secs < 3600 )
      {
          var mints = secs / 60;
          var remainder = parseInt(secs.toString().split(".")[0]) -
(parseInt(mints.toString().split(".")[0]) * 60);
          var szmin;
          if ( mints > 1 )
          {
              szmin = "minutes";
          }
          else
          {
              szmin = "minute";
          }
          return mints.toString().split(".")[0] + " " + szmin + " " +
remainder.toString() + " seconds";
      }
      else
      {
          var mints = secs / 60;
          var hours = mints / 60;
          var remainders = parseInt(secs.toString().split(".")[0]) -
(parseInt(mints.toString().split(".")[0]) * 60);
          var remainderm = parseInt(mints.toString().split(".")[0]) -
(parseInt(hours.toString().split(".")[0]) * 60);
          var szmin;
          if ( remainderm > 1 )
          {
              szmin = "minutes";
          }
          else
          {
              szmin = "minute";
          }
          var szhr;
          if ( remainderm > 1 )
          {
              szhr = "hours";
          }
          else
          {
              szhr = "hour";
              for ( i = 0 ; i < cfield.value.length ; i++)
				  {
				    var n = cfield.value.substr(i,1);
				    if ( n != 'a' && n != 'b' && n != 'c' && n != 'd'
				      && n != 'e' && n != 'f' && n != 'g' && n != 'h'
				      && n != 'i' && n != 'j' && n != 'k' && n != 'l'
				      && n != 'm' && n != 'n' && n != 'o' && n != 'p'
				      && n != 'q' && n != 'r' && n != 's' && n != 't'
				      && n != 'u' && n != 'v' && n != 'w' && n != 'x'
				      && n != 'y' && n != 'z'
				      && n != 'A' && n != 'B' && n != 'C' && n != 'D'
				      && n != 'E' && n != 'F' && n != 'G' && n != 'H'
				      && n != 'I' && n != 'J' && n != 'K' && n != 'L'
				      && n != 'M' && n != 'N' &&  n != 'O' && n != 'P'
				      && n != 'Q' && n != 'R' && n != 'S' && n != 'T'
				      && n != 'U' && n != 'V' && n != 'W' && n != 'X'
				      && n != 'Y' && n != 'Z'
				      && n != '0' && n != '1' && n != '2' && n != '3'
				      && n != '4' && n != '5' && n != '6' && n != '7'
				      && n != '8' && n != '9'
				      && n != '_' && n != '@' && n != '-' && n != '.' )
				    {
				      window.alert("Only Alphanumeric are allowed.\nPlease re-enter the value.");
				      cfield.value = '';
				      cfield.focus();
				    }
				    cfield.value =  cfield.value.toUpperCase();
				  }
				  return;
          }
          return hours.toString().split(".")[0] + " " + szhr + " " +
mints.toString().split(".")[0] + " " + szmin;
      }
  }
 exports.main = main;