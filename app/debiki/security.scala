/**
 * Copyright (c) 2011 Kaj Magnus Lindberg (born 1979)
 */

package com.debiki.v0

import com.debiki.v0.Prelude._
import controllers.JsonOrFormDataBody
import debiki.DebikiHttp._
import java.{util => ju, io => jio}
import play.api.mvc.Cookie
import play.api.Logger
import scala.xml.{Text, Node, NodeSeq}
import DebikiSecurity._


object DebikiSecurity {

  /**
   * Finds the session id and any xsrf token in the specified request;
   * throws an error if this is not a GET request and the xsrf token is bad.
   * @return The current SID and xsrf token. Or new ones if needed (with no
   * login id, no user, no display name), and a new SID and xsrf cookie.
   * @throws DebikiHttp.ResultException, for non-GET requests,
   * if the SID or the XSRF token is bad.
   *
   * However, for GET request where `maySetCookies` is false, and there
   * is no XSRF cookie, creates no new cookies, and returns XsrfOk("").
   * (No cookies should be set if the response might be cached by a proxy
   * server.)
   */
  def checkSidAndXsrfToken(request: play.api.mvc.Request[_],
        maySetCookies: Boolean)
        : (SidStatus, XsrfOk, List[Cookie]) = {

    val sidCookieValOpt = urlDecodeCookie("dwCoSid", request)
    val sidStatus: SidStatus =
      sidCookieValOpt.map(Sid.check(_)) getOrElse SidAbsent

    // On GET requests, simply accept the value of the xsrf cookie.
    // (On POST requests, however, we check the xsrf form input value)
    val xsrfCookieValOpt = urlDecodeCookie(XsrfCookieName, request)

    val sidXsrfNewCookies: (SidStatus, XsrfOk, List[Cookie]) =
      if (request.method == "GET") {
        // Accept this request, and create new XSRF token if needed.

        if (!sidStatus.isOk && sidStatus != SidAbsent)
          Logger.warn("Bad SID: "+ sidStatus +", from IP: "+
             request.remoteAddress)

        val (xsrfOk: XsrfOk, anyNewXsrfCookie: List[Cookie]) =
          if (xsrfCookieValOpt.isDefined) {
            (XsrfOk(xsrfCookieValOpt.get), Nil)
          }
          else if (!maySetCookies) {
            // No XSRF token available, and none needed, since this
            // a GET request.
            (XsrfOk(""), Nil)
          }
          else {
            val newXsrfOk = Xsrf.create()
            val cookie = urlEncodeCookie(XsrfCookieName, newXsrfOk.value)
            (newXsrfOk, List(cookie))
          }

        (sidStatus, xsrfOk, anyNewXsrfCookie)
      }
      else {
        // Reject this request if the XSRF token is invalid,
        // or if the SID is corrupt (but not if simply absent).
        assert(request.method == "POST")
        assert(maySetCookies)

        // There must be an xsrf token in a certain header, or in a certain
        // input in any POST:ed form data. Check the header first, in case
        // this is a JSON request (then there is no form data).
        var xsrfToken = request.headers.get(AngularJsXsrfHeaderName) orElse {
          if (request.body.isInstanceOf[Map[String, Seq[String]]]) {
            val params = request.body.asInstanceOf[Map[String, Seq[String]]]
            params.get(debiki.HtmlForms.XsrfInpName).map(_.head)
          }
          else if (request.body.isInstanceOf[JsonOrFormDataBody]) {
            val body = request.body.asInstanceOf[JsonOrFormDataBody]
            body.getFirst(debiki.HtmlForms.XsrfInpName)
          }
          else {
            None
          }
        } getOrElse
            throwForbidden("DwE0y321", "No XSRF token")

        val xsrfOk = {
          val xsrfStatus = Xsrf.check(xsrfToken, xsrfCookieValOpt)
          if (!xsrfStatus.isOk) {
            // Create a new XSRF cookie so whatever-the-user-attempted
            // will work, should s/he try again.
            // (If Javascript is enabled, debiki.js should detect logins
            // in other browser tabs, and then check the new SID cookie and
            // refresh XSRF tokens in any <form>s.)
            val newXsrfCookie =
              urlEncodeCookie(XsrfCookieName, Xsrf.create().value)

            // If this request is indeed part of one of Mallory's XSRF attacks,
            // the cookie still won't be sent to Mallory's web page, so creating
            // a new token should be safe. However, it makes it possible for
            // Mallory to conduct a DoS attack against [the user that makes
            // this request], if the user has Javascript disabled (since
            // Malory can change the user's XSRF token by attempting an XSRF
            // attack, but the web page cannot update the XSRF form <input>s
            // with the new value). This feels rather harmless though, and I
            // think it's more likely that I change the server side code in
            // some manner (e.g. I'm thinking about rejecting XSRF tokens that
            // are very old) and then it's a good thing that a new valid
            // token be created here. (?)

            throwForbiddenDialog(
              "DwE35k3wkU9", "Security issue: Bad XSRF token", "", i"""
              |Please try again:
              |  - Click any button you just clicked, again.
              |  - Or reload the page.
              |  - Or return to the previous page and reload it.
              |
              |If you reload the page, copy-paste any unsaved text to a text editor,
              |or it'll be lost on reload.
              |
              |(You now have a new XSRF token.)
              """, withCookie = Some(newXsrfCookie))
          }
          xsrfStatus.asInstanceOf[XsrfOk]
        }

        (sidStatus) match {
          case sidOk: SidOk => (sidOk, xsrfOk, Nil)
          case SidAbsent => (SidAbsent, xsrfOk, Nil)
          case _ => throwForbidden("DwE530Rstx90", "Bad SID")
        }
      }

    sidXsrfNewCookies
  }


  /**
   * A HTTP header in which AngularJS sends any xsrf token, when AngularJS
   * posts JSON. (So you cannot rename this header.)
   */
  val AngularJsXsrfHeaderName = "X-XSRF-TOKEN"

  /** Don't rename. Is used by AngularJS: AngularJS copies the value of
    * this cookie to the HTTP header just above.
    * See: http://docs.angularjs.org/api/ng.$http, search for "XSRF-TOKEN".
    */
  val XsrfCookieName = "XSRF-TOKEN"
}


sealed abstract class XsrfStatus { def isOk = false }
case object XsrfAbsent extends XsrfStatus
case object XsrfNoSid extends XsrfStatus
case object XsrfBad extends XsrfStatus
case class XsrfOk(value: String) extends XsrfStatus {
  override def isOk = true
}


object Xsrf {
  private val _secretSalt = "w4k2i2ErK84o938"  // hardcoded, for now
  private val _hashLength = 14


  def check(xsrfToken: String, xsrfCookieValue: Option[String]): XsrfStatus = {
    // COULD check date, and hash, to find out if the token is too old.
    // (Perhaps shouldn't accept e.g. 1 year old tokens?)
    // However, if we don't care about the date, this is enough:
    if (Some(xsrfToken) != xsrfCookieValue) XsrfBad
    else XsrfOk(xsrfToken)
  }


  /**
   * Generates a new XSRF token, based on the current dati and a random number.
   *
   * If the hash is correct, and the dati not too old, the token is okay.
   *
   * (The token is not based on the SID, because when a user loads his/her
   * very first page and logins for the first time, no SID is available.)
   */
  def create(): XsrfOk =
    XsrfOk(
      (new ju.Date).getTime +"."+ nextRandomString().take(10))


  def newSidAndXsrf(loginGrant: Option[LoginGrant])
        : (SidOk, XsrfOk, List[Cookie]) =
    newSidAndXsrf(
      loginId = loginGrant.map(_.login.id),
      userId = loginGrant.map(_.user.id),
      displayName = loginGrant.map(_.displayName))


  def newSidAndXsrf(
        loginId: Option[String],
        userId: Option[String],
        displayName: Option[String])
        : (SidOk, XsrfOk, List[Cookie]) = {
    // Note that the xsrf token is created using the non-base64 encoded
    // cookie value.
    val sidOk = Sid.create(loginId, userId, displayName)
    val xsrfOk = create()
    val sidCookie = urlEncodeCookie("dwCoSid", sidOk.value)
    val xsrfCookie = urlEncodeCookie(XsrfCookieName, xsrfOk.value)
    (sidOk, xsrfOk, sidCookie::xsrfCookie::Nil)
  }
}


sealed abstract class SidStatus {
  def isOk = false
  def loginId: Option[String] = None
  def userId: Option[String] = None
  def roleId: Option[String] = None
  def displayName: Option[String] = None
}

case object SidAbsent extends SidStatus
case object SidBadFormat extends SidStatus
case object SidBadHash extends SidStatus
//case class SidExpired(millisAgo: Long) extends SidStatus


case class SidOk(
  value: String,
  ageInMillis: Long,
  override val loginId: Option[String],
  override val userId: Option[String],

  /**
   * Remembering the display name saves 1 database rondtrip every time
   * a page is rendered, because `Logged in as <name>' info is shown.
   *
   * (Were the display name not included in the SID cookie, one would have
   * to look it up in the database.)
   */
  override val displayName: Option[String])
  extends SidStatus {

  override def isOk = true

  // Unauthenticated users' ids start with '-'.
  override def roleId: Option[String] = userId.filter(!_.startsWith("-"))
}


/**
 * Session ID stuff.
 *
 * A session id cookie is created on the first page view.
 * It is cleared on logout, and a new one generated on login.
 * Lift-Web's cookies and session state won't last across server
 * restarts and I want to be able to restart the app servers at
 * any time so I don't use Lift's stateful session stuff so very much.
 */
object Sid {
  val sidHashLength = 14
  private val _secretSidSalt = "w4k2i2rK8409kk3xk"  // hardcoded, for now
  private val _sidMaxMillis = 2 * 31 * 24 * 3600 * 1000  // two months
  //private val _sidExpireAgeSecs = 5 * 365 * 24 * 3600  // five years

  def check(value: String): SidStatus = {
    // Example value: 88-F7sAzB0yaaX.1312629782081.1c3n0fgykm  - no, obsolete
    if (value.length <= sidHashLength) return SidBadFormat
    val (hash, dotLoginUidNameDateRandom) = value splitAt sidHashLength
    val realHash = hashSha1Base64UrlSafe(
      _secretSidSalt + dotLoginUidNameDateRandom) take sidHashLength
    if (hash != realHash) return SidBadHash
    dotLoginUidNameDateRandom.drop(1).split('.') match {
      case Array(loginId, userId, nameNoDots, dateStr, randVal) =>
        val ageMillis = (new ju.Date).getTime - dateStr.toLong
        val displayName = nameNoDots.replaceAll("_", ".")
        //if (ageMillis > _sidMaxMillis)
        //  return SidExpired(ageMillis - _sidMaxMillis)
        SidOk(
          value = value,
          ageInMillis = ageMillis,
          loginId = if (loginId isEmpty) None else Some(loginId),
          userId = if (userId isEmpty) None else Some(userId),
          displayName = if (displayName isEmpty) None else Some(displayName))
      case _ => SidBadFormat
    }
  }

  /**
   * Creates and returns a new SID.
   */
  def create(
        loginId: Option[String], userId: Option[String],
        displayName: Option[String]): SidOk = {
    // For now, create a SID value and *parse* it to get a SidOk.
    // This is stupid and inefficient.
    val nameNoDots = displayName.map(
      _.replaceAll("\\.", "_")) // Could use replaceAllLiterally, Scala 2.9.1?
    val uid = "" // for now
    val loginUidNameDateRandom =
      loginId.getOrElse("") +"."+
         userId.getOrElse("") +"."+
         nameNoDots.getOrElse("") +"."+
         (new ju.Date).getTime +"."+
         (nextRandomString() take 10)
    val saltedHash = hashSha1Base64UrlSafe(
      _secretSidSalt +"."+ loginUidNameDateRandom) take sidHashLength
    val value = saltedHash +"."+ loginUidNameDateRandom

    check(value).asInstanceOf[SidOk]
  }

  def newCookie(
        loginId: Option[String], userId: Option[String],
        displayName: Option[String]): Cookie = {
    val sidOk = create(loginId, userId, displayName)
    urlEncodeCookie("dwCoSid", sidOk.value)
  }
}

