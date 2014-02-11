var should = require('should');
var xoss = require(__dirname + '/../');

var xml = '<library><shelf id="returns" /><section name="fiction"><shelf id="1023">' +
            '<book title="A Chai Too Hot"><author>TJ Hollowaychuk</author><pages>411</pages></book>' +
            '<book title="How to Write Sample XML" author="John Jacob Jingleheimer-Schmidt" pages="8812" />' +
          '</shelf><shelf><id>4414</id>' +
            '<book><title>XML Can Be Fun Too</title><author>Lloyd Christmas</author><contents>' +
              '<chapter id="1">The significance of foo and bar</chapter>' +
              '<chapter id="2">Baz and bat can be fun too</chapter>' +
              '<chapter id="3">Why leave out bippy?</chapter><pages>41</pages></book>' +
          '</shelf></section></library>';

describe('XML Stream', function() {
  describe('without callback', function() {
    it('should return a promise that resolves to all matched nodes', function(done) {
      var xos = xoss();
      xos(xml, '//book').then(function(books) {
        books.length.should.equal(3);
        done();
      }, done);
    });
  });

  describe('different query types', function() {
    describe('plain string', function() {
      it('should match exact paths', function(done) {
        var xos = xoss();
        xos(xml, '/library/section/shelf').then(function(s) {
          s.length.should.equal(2);
          done();
        }, done);
      });
    });

    describe('multiple queries', function() {
      it('should process all queries in an array', function(done) {
        var xos = xoss();
        xos(xml, ['/library/shelf', '/library/section/shelf']).then(function(s) {
          s.length.should.equal(3);
          done();
        }, done);
      });

      it('should only match each node at most once', function(done) {
        var xos = xoss();
        xos(xml, ['/library/shelf', '//shelf', '/library/section/shelf']).then(function(s) {
          s.length.should.equal(3);
          done();
        }, done);
      });
    });
  });
});
