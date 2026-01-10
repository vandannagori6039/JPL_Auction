export const isAuthenticated = (req, res, next) => {
  if (req.session.isAdmin === true) {
    return next();
  }
  req.session.error = 'Please login to access this page';
  res.redirect('/admin/login');
};

export const isNotAuthenticated = (req, res, next) => {
  if (req.session.isAdmin === true) {
    return res.redirect('/admin/dashboard');
  }
  next();
};
