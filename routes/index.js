
/*
 * GET home page.
 */

exports.index = function(req, res){
  var isProduction = process.env.NODE_ENV === "production";
  res.render('index', { title: 'The Birthday Helper', isProduction: isProduction});
};