{% extends 'base.swig' %}
{% block main %}

  <p>
    Enter a Twitter name to mute and select a duration. When the time's up they'll
    be automatically unmuted.
  </p>

  <form method="POST" action="/mute">
    <div class="form-group col-sm-4">
      <label for="screen_name">Twitter Name</label>
      <input class="form-control" name="screen_name" id="screen_name" />
    </div>

    <div class="form-group col-sm-8">
      <label for="duration">How Long?</label>
      <div class="list-group">
        <button class="btn btn-default" name="duration" type="submit" value="1800" title="Live-tweeting a streaming show; it doesn't even make sense">30 minutes</button>
        <button class="btn btn-default" name="duration" type="submit" value="3600" title="An episode of Keeping up with the Kardashians">1 hour</button>
        <button class="btn btn-default" name="duration" type="submit" value="7200" title="A sporting event you are tired of hearing about">2 hours</button>
        <button class="btn btn-default" name="duration" type="submit" value="28800" title="Updates on the status of their delayed flight">8 hours</button>
        <button class="btn btn-default" name="duration" type="submit" value="86400" title="That Apple event when they reveal new iPods or whatever">1 day</button>
        <button class="btn btn-default" name="duration" type="submit" value="172800" title="A conference that's probably interesting if you knew any of the people or acronyms">2 days</button>
        <button class="btn btn-default" name="duration" type="submit" value="604800" title="Newly discovered libertarianism, crossfit, veganism, etc.">1 week</button>
      </div>
    </div>

  </form>

  {% if user.mutes %}
    <ul>
      {% for screenName, info in user.mutes %}
        <li><strong>{{ screenName }}:</strong> unmute <time class="relative-time" datetime="{{ info.endTime | date('c') }}">{{ info.endTime | date('r') }}</time></li>
      {% endfor %}
    </ul>
  {% endif %}

{% endblock main %}
