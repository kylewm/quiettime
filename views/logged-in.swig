{% extends 'base.swig' %}
{% block main %}

  <p>
    Enter a Twitter name to mute and select a duration. When the time's up they'll
    be automatically unmuted.
    <a href="/logout">(sign out)</a>.</form>
  </p>

  <form method="POST" action="/mute" class="row">
    <div class="form-group col-sm-4">
      <label for="screen_name">Twitter Name</label>
      <input class="form-control" name="screen_name" id="screen_name" />
    </div>

    <div class="form-group col-sm-8">
      <label for="duration">How Long?</label>
      <div class="list-group">
        <button class="btn btn-primary" name="duration" type="submit" value="3600" title="Live-tweeting Keeping up with the Kardashians">1 hour</button>

        <button class="btn btn-default" name="duration" type="submit" value="30" title="Let's just see if this thing works">30 seconds</button>
        <button class="btn btn-default" name="duration" type="submit" value="1800" title="Now, I don't want to get off on a rant here">30 minutes</button>
        <button class="btn btn-default" name="duration" type="submit" value="7200" title="At a sporting event you are tired of hearing about">2 hours</button>
        <button class="btn btn-default" name="duration" type="submit" value="28800" title="Updating everyone on the status of their delayed flight">8 hours</button>
        <button class="btn btn-default" name="duration" type="submit" value="86400" title="At that Apple event when they reveal new iPods or whatever">1 day</button>
        <button class="btn btn-default" name="duration" type="submit" value="172800" title="At a weekend conference that'd probably be interesting if you knew any of the people or acronyms">2 days</button>
        <button class="btn btn-default" name="duration" type="submit" value="604800" title="They've just discovered libertarianism, crossfit, veganism, etc.">1 week</button>
      </div>
    </div>

  </form>

  {% if user.mutes %}
    <p class="lead">
      These tweeps are muted at the moment
    </p>

    <ul>
      {% for screenName, info in user.mutes %}
        <li id="item-{{screenName}}">
          <strong><a href="https://twitter.com/{{screenName}}" target="_blank">{{ screenName }}</a>:</strong> unmute <time class="relative-time" datetime="{{ info.endTime | date('c') }}">{{ info.endTime | date('r') }}</time>
          <form method="POST" action="/unmute" style="display: inline">
            <input type="hidden" name="screen_name" value="{{ screenName }}" />
            <button class="btn btn-link" type="submit">Unmute Now</button>
          </form>
        </li>
      {% endfor %}
    </ul>
  {% endif %}

{% endblock main %}

{% block scripts %}
  {% parent %}

  <script type="text/javascript">
    var source = new EventSource('/events')

    source.addEventListener('unmute', function(e) {
        console.log(e)
        $('#item-' + e.data).remove()
    }, false)

  </script>

{% endblock scripts %}
