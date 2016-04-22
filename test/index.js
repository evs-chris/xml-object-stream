var should = require('should');
var xoss = require(__dirname + '/../');

var xml = '<library><shelf id="returns" /><section name="fiction"><shelf id="1023">' +
            '<book title="A Chai Too Hot"><author>TJ Hollowaychuk</author><pages>411</pages></book>' +
            '<book title="How to Write Sample XML" author="John Jacob Jingleheimer-Schmidt" pages="8812" />' +
          '</shelf><shelf><id>4414</id>' +
            '<book><title>XML Can Be Fun Too</title><author>Lloyd Christmas</author><contents>' +
              '<chapter id="1">The significance of foo and bar</chapter>' +
              '<chapter id="2">Baz and bat can be fun too</chapter>' +
              '<chapter id="3">Why leave out bippy?</chapter></contents><pages>41</pages></book>' +
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

  describe('with a callback', function() {
    it('should fire the callback for matched nodes', function(done) {
      var xos = xoss({ pojo: true });
      var count = 0;
      xos(xml, '//book', function(b) {
        count++;
        if (count === 1) b.pages.should.equal('411');
        if (count === 2) b.pages.should.equal('8812');
        if (count === 3) b.pages.should.equal('41');
        if (count === 3) done();
      });
    });

    it('should be cool with chunking too', function(done) {
      var xos = xoss({ pojo: true, chunk: 32 });
      var count = 0;
      xos(xml, '//book', function(b) {
        count++;
        if (count === 1) b.pages.should.equal('411');
        if (count === 2) b.pages.should.equal('8812');
        if (count === 3) b.pages.should.equal('41');
        if (count === 3) done();
      });
    });
  });

  describe('xml as a string', function() {
    it('should chunk properly', function(done) {
      var xos = xoss({ chunk: 32 });
      xos(xml, '//book').then(function(books) {
        books.length.should.equal(3);
      }).then(done, done);
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

  describe('matching', function() {
    it('should gather children on matched nodes', function(done) {
      var count = 0;
      var xos = xoss({ pojo: true });
      xos(xml, '//shelf', function(shelf) {
        if (count === 0) shelf.id.should.equal('returns');
        else if (count === 1) shelf.book.length.should.equal(2);
        else if (count === 2) shelf.book.contents.chapter.length.should.equal(3);
        count++;
      }).onEnd(function() {
        count.should.equal(3);
        done();
      });
    });
  });
});
