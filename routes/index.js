
/*
 * GET home page.
 */

exports.index = function(req, res){
  var isProduction = process.env.NODE_ENV === "production";
  var analyticsKey = isProduction ? "EkReItfCu9" : "8D6vIxmwc9p5BT5C4DUgHwRAS04CRtpj";
  res.render('index', { title: 'The Birthday Helper', isProduction: isProduction, analyticsKey:analyticsKey});
};