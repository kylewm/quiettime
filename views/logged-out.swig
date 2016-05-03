{% extends 'base.swig' %}
{% block main %}

  <form method="GET" action="/login">
    <button class="btn btn-primary btn-lg">Sign-in with Twitter</button>
  </form>

{% endblock main %}
